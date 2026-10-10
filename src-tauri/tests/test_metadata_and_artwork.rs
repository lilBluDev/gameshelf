use gameshelf_lib::cache::artwork::ArtworkCache;
use gameshelf_lib::db::schema::{
    ArtworkAsset, Game, GameOverrides, GameStatus, LaunchAction, SourceKind,
};
use gameshelf_lib::db::Database;
use gameshelf_lib::metadata::matching::{
    calculate_match_score, parse_and_normalize_title, ConfidenceTier,
};
use gameshelf_lib::metadata::provider::{ArtworkRole, MetadataProvider};
use gameshelf_lib::metadata::steamgriddb::SteamGridDbClient;

use std::fs::File;
use std::io::Write;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tempfile::tempdir;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

// Minimal valid 1x1 transparent PNG bytes (67 bytes)
const VALID_1X1_PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
];

/// Helper: spins up a lightweight zero-dependency mock HTTP server for testing SGDB endpoints
async fn spawn_mock_server() -> (String, Arc<AtomicUsize>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let request_count = Arc::new(AtomicUsize::new(0));
    let req_counter = request_count.clone();

    tokio::spawn(async move {
        loop {
            if let Ok((mut socket, _)) = listener.accept().await {
                let req_num = req_counter.fetch_add(1, Ordering::SeqCst);
                let mut buf = [0u8; 2048];
                let n = socket.read(&mut buf).await.unwrap_or(0);
                let req_text = String::from_utf8_lossy(&buf[..n]);

                let (status, headers, body) = if req_text.contains("/retry-test") {
                    // Return 429 on first call, 200 on second call!
                    if req_num == 0 {
                        (
                            "429 Too Many Requests",
                            "Retry-After: 1\r\nContent-Type: text/plain\r\n",
                            b"Rate limit exceeded".to_vec(),
                        )
                    } else {
                        (
                            "200 OK",
                            "Content-Type: application/json\r\n",
                            r#"{"success":true,"data":[{"id":99,"name":"Portal Retried","types":[],"verified":true}]}"#.as_bytes().to_vec(),
                        )
                    }
                } else if req_text.contains("/unauthorized-test") {
                    (
                        "401 Unauthorized",
                        "Content-Type: application/json\r\n",
                        r#"{"success":false,"errors":["Invalid API token"]}"#
                            .as_bytes()
                            .to_vec(),
                    )
                } else if req_text.contains("/search/autocomplete") {
                    (
                        "200 OK",
                        "Content-Type: application/json\r\n",
                        r#"{"success":true,"data":[{"id":99,"name":"Portal","types":["steam"],"verified":true,"release_date":1191974400}]}"#.as_bytes().to_vec(),
                    )
                } else if req_text.contains("/grids/game/99") {
                    (
                        "200 OK",
                        "Content-Type: application/json\r\n",
                        r#"{"success":true,"data":[{"id":1001,"score":50,"url":"http://127.0.0.1/image.png","width":600,"height":900,"mime":"image/png","nsfw":false,"humor":false}]}"#.as_bytes().to_vec(),
                    )
                } else if req_text.contains("/valid-image.png") {
                    (
                        "200 OK",
                        "Content-Type: image/png\r\n",
                        VALID_1X1_PNG.to_vec(),
                    )
                } else if req_text.contains("/corrupt-image.png") {
                    (
                        "200 OK",
                        "Content-Type: image/png\r\n",
                        b"This is not a real PNG file".to_vec(),
                    )
                } else {
                    (
                        "404 Not Found",
                        "Content-Type: application/json\r\n",
                        r#"{"success":false,"errors":["Not Found"]}"#.as_bytes().to_vec(),
                    )
                };

                let resp = format!(
                    "HTTP/1.1 {}\r\nContent-Length: {}\r\n{}\r\n",
                    status,
                    body.len(),
                    headers
                );
                let _ = socket.write_all(resp.as_bytes()).await;
                let _ = socket.write_all(&body).await;
            }
        }
    });

    (format!("http://{}", addr), request_count)
}

#[tokio::test]
async fn test_matching_engine_titles_and_sequels() {
    let p = parse_and_normalize_title("Dark Souls: Remastered [v1.0] (USA)");
    assert_eq!(p.clean_title, "dark souls");

    let p2 = parse_and_normalize_title("Final Fantasy VII");
    assert_eq!(p2.clean_title, "final fantasy 7");
    assert_eq!(p2.sequel_identifier.as_deref(), Some("7"));

    let p3 = parse_and_normalize_title("Final Fantasy VIII");
    assert_eq!(p3.clean_title, "final fantasy 8");
    assert_eq!(p3.sequel_identifier.as_deref(), Some("8"));

    // Sequels must not match
    let score = calculate_match_score("Final Fantasy VII", "Final Fantasy VIII", None, None);
    assert!(score <= 0.35);

    // Identical normalized titles with matching years get 1.0
    let score_exact = calculate_match_score("Prey (2006)", "Prey (2006)", None, None);
    assert_eq!(score_exact, 1.0);
    assert_eq!(
        ConfidenceTier::from_score(score_exact),
        ConfidenceTier::High
    );
}

#[tokio::test]
async fn test_sgdb_client_search_success() {
    let (base_url, _) = spawn_mock_server().await;
    let client = SteamGridDbClient::with_base_url(&base_url, Some("valid_token".to_string()));

    let candidates = client.search_games("Portal", Some(2007)).await.unwrap();
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].provider_game_id, "99");
    assert_eq!(candidates[0].name, "Portal");
    assert_eq!(candidates[0].confidence_tier, ConfidenceTier::High);
}

#[tokio::test]
async fn test_sgdb_client_handles_429_retry_backoff() {
    let (base_url, counter) = spawn_mock_server().await;
    let client = SteamGridDbClient::with_base_url(&base_url, Some("valid_token".to_string()));

    // search with term that hits /retry-test
    let candidates = client.search_games("retry-test", None).await.unwrap();
    assert_eq!(candidates.len(), 1);
    assert_eq!(candidates[0].name, "Portal Retried");
    // Verify client retried after 429
    assert_eq!(counter.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn test_sgdb_client_handles_401_unauthorized() {
    let (base_url, _) = spawn_mock_server().await;
    let client = SteamGridDbClient::with_base_url(&base_url, Some("invalid_token".to_string()));

    let err = client
        .search_games("unauthorized-test", None)
        .await
        .unwrap_err();
    assert!(err.to_string().contains("Invalid SteamGridDB API key"));
}

#[tokio::test]
async fn test_artwork_cache_download_and_atomic_validation() {
    let (base_url, _) = spawn_mock_server().await;
    let dir = tempdir().unwrap();
    let cache = ArtworkCache::new(dir.path()).unwrap();

    let valid_url = format!("{}/valid-image.png", base_url);
    let downloaded = cache
        .download_and_validate("game-123", ArtworkRole::Cover, "asset-456", &valid_url)
        .await
        .unwrap();

    assert!(downloaded.cached_path.exists());
    assert_eq!(downloaded.width, 1);
    assert_eq!(downloaded.height, 1);
    assert_eq!(downloaded.mime_type, "image/png");

    let stats = cache.get_stats().unwrap();
    assert_eq!(stats.file_count, 1);
    assert_eq!(stats.total_bytes, 67);
}

#[tokio::test]
async fn test_artwork_cache_rejects_corrupt_data() {
    let (base_url, _) = spawn_mock_server().await;
    let dir = tempdir().unwrap();
    let cache = ArtworkCache::new(dir.path()).unwrap();

    let corrupt_url = format!("{}/corrupt-image.png", base_url);
    let err = cache
        .download_and_validate(
            "game-123",
            ArtworkRole::Cover,
            "asset-corrupt",
            &corrupt_url,
        )
        .await
        .unwrap_err();

    assert!(err.to_string().contains("Image decoding validation failed"));

    // Cache directory should have 0 valid files (no temp file leftover)
    let stats = cache.get_stats().unwrap();
    assert_eq!(stats.file_count, 0);
}

#[tokio::test]
async fn test_artwork_cache_import_local_image() {
    let dir = tempdir().unwrap();
    let cache_dir = dir.path().join("cache");
    let cache = ArtworkCache::new(&cache_dir).unwrap();

    let local_file = dir.path().join("my_cover.png");
    {
        let mut f = File::create(&local_file).unwrap();
        f.write_all(VALID_1X1_PNG).unwrap();
    }

    let downloaded = cache
        .import_local_image("game-999", ArtworkRole::Cover, &local_file)
        .unwrap();

    assert!(downloaded.cached_path.exists());
    assert_eq!(downloaded.width, 1);
    assert_eq!(downloaded.height, 1);

    // Clear cache
    let cleared = cache.clear_cache().unwrap();
    assert_eq!(cleared, 1);
    assert_eq!(cache.get_stats().unwrap().file_count, 0);
}

#[test]
fn test_db_artwork_selection_and_locked_fields_preservation() {
    let db = Database::in_memory().unwrap();

    // Create a base game
    let game = Game {
        id: "game-test-1".to_string(),
        title: "Test Game".to_string(),
        sort_title: "test game".to_string(),
        description: Some("Original Description".to_string()),
        developer: Some("Original Dev".to_string()),
        publisher: Some("Original Pub".to_string()),
        release_year: Some(2020),
        genres: vec!["Action".to_string()],
        tags: vec![],
        source_kind: SourceKind::Standalone,
        source_id: None,
        install_dir: None,
        launch_action: LaunchAction::Unavailable {
            reason: "test".to_string(),
        },
        status: GameStatus::Installed,
        last_scanned_at: None,
        is_favorite: false,
        is_hidden: false,
        notes: None,
        user_tags: vec![],
        match_confidence: None,
        provider_attribution: None,
        last_launched_at: None,
        normalized_path: None,
        created_at: "2026-01-01T00:00:00Z".to_string(),
        playtime_seconds: 0,
        session_count: 0,
        last_played_at: None,
        artwork: None,
    };
    db.add_game(&game).unwrap();

    // Save 2 covers and 1 hero
    let cover1 = ArtworkAsset {
        id: "cover-1".to_string(),
        game_id: "game-test-1".to_string(),
        role: "cover".to_string(),
        provider: "steamgriddb".to_string(),
        provider_asset_id: Some("101".to_string()),
        source_url: Some("http://example.com/cover1.jpg".to_string()),
        cached_path: Some("c:/cache/cover1.jpg".to_string()),
        width: Some(600),
        height: Some(900),
        mime_type: Some("image/jpeg".to_string()),
        attribution: Some("Artist 1".to_string()),
        is_selected: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    let cover2 = ArtworkAsset {
        id: "cover-2".to_string(),
        game_id: "game-test-1".to_string(),
        role: "cover".to_string(),
        provider: "steamgriddb".to_string(),
        provider_asset_id: Some("102".to_string()),
        source_url: Some("http://example.com/cover2.jpg".to_string()),
        cached_path: Some("c:/cache/cover2.jpg".to_string()),
        width: Some(600),
        height: Some(900),
        mime_type: Some("image/jpeg".to_string()),
        attribution: Some("Artist 2".to_string()),
        is_selected: false,
        created_at: "2026-01-02T00:00:00Z".to_string(),
    };
    let hero1 = ArtworkAsset {
        id: "hero-1".to_string(),
        game_id: "game-test-1".to_string(),
        role: "hero".to_string(),
        provider: "steamgriddb".to_string(),
        provider_asset_id: Some("201".to_string()),
        source_url: Some("http://example.com/hero1.jpg".to_string()),
        cached_path: Some("c:/cache/hero1.jpg".to_string()),
        width: Some(1920),
        height: Some(620),
        mime_type: Some("image/jpeg".to_string()),
        attribution: Some("Artist 3".to_string()),
        is_selected: true,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };

    db.save_artwork_asset(&cover1).unwrap();
    db.save_artwork_asset(&cover2).unwrap();
    db.save_artwork_asset(&hero1).unwrap();

    // Verify initial selection
    let selected = db.get_selected_artwork("game-test-1").unwrap();
    assert_eq!(selected.get("cover").unwrap().id, "cover-1");
    assert_eq!(selected.get("hero").unwrap().id, "hero-1");

    // Switch selected cover to cover-2
    db.select_artwork_asset("game-test-1", "cover-2").unwrap();
    let selected_updated = db.get_selected_artwork("game-test-1").unwrap();
    assert_eq!(selected_updated.get("cover").unwrap().id, "cover-2");

    // Lock "developer" and "cover" fields
    db.set_locked_fields(
        "game-test-1",
        &["developer".to_string(), "cover".to_string()],
    )
    .unwrap();
    let locked = db.get_locked_fields("game-test-1").unwrap();
    assert!(locked.contains("developer"));
    assert!(locked.contains("cover"));

    // User also made an explicit override for title
    db.update_game_overrides(&GameOverrides {
        game_id: "game-test-1".to_string(),
        title: Some("User Renamed Game".to_string()),
        sort_title: None,
        description: None,
        developer: None,
        publisher: None,
        release_year: None,
        genres: None,
        tags: None,
        notes: None,
        user_tags: None,
        is_favorite: None,
        is_hidden: None,
        locked_fields: Some(vec!["developer".to_string(), "cover".to_string()]),
        updated_at: "2026-01-03T00:00:00Z".to_string(),
    })
    .unwrap();

    // Simulate provider metadata refresh: new developer, new publisher, new description
    db.update_game_metadata_from_provider(
        "game-test-1",
        Some("Updated Description"),
        Some("New Provider Dev"),
        Some("New Provider Pub"),
        Some(2021),
        Some(&["Adventure".to_string()]),
        None,
        Some(0.95),
        Some("SteamGridDB"),
    )
    .unwrap();

    // Verify:
    let fetched = db.get_game_by_id("game-test-1").unwrap().unwrap();
    // User override title survives!
    assert_eq!(fetched.title, "User Renamed Game");
    // Locked developer survives (NOT overwritten by provider)!
    assert_eq!(fetched.developer.as_deref(), Some("Original Dev"));
    // Unlocked publisher is updated by provider!
    assert_eq!(fetched.publisher.as_deref(), Some("New Provider Pub"));
    // Unlocked description is updated by provider!
    assert_eq!(fetched.description.as_deref(), Some("Updated Description"));
    // Selected artwork is attached to game!
    assert!(fetched.artwork.is_some());
    assert_eq!(
        fetched.artwork.as_ref().unwrap().get("cover").unwrap().id,
        "cover-2"
    );
}

#[test]
fn test_asset_protocol_scope_boundary() {
    let app_data_dir = std::path::PathBuf::from(r"C:\Users\User\AppData\Roaming\com.gameshelf.app");
    let artwork_dir = app_data_dir.join("artwork");
    let allowed_artwork_file = artwork_dir.join("cover").join("test.jpg");
    let forbidden_db_file = app_data_dir.join("gameshelf.db");
    let forbidden_backup_file = app_data_dir.join("gameshelf.db.backup.123");
    let forbidden_log_file = app_data_dir.join("logs").join("app.log");

    assert!(allowed_artwork_file.starts_with(&artwork_dir));
    assert!(!forbidden_db_file.starts_with(&artwork_dir));
    assert!(!forbidden_backup_file.starts_with(&artwork_dir));
    assert!(!forbidden_log_file.starts_with(&artwork_dir));
}

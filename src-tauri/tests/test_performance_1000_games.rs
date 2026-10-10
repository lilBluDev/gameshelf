use gameshelf_lib::db::schema::{Game, GameStatus, LaunchAction, SourceKind};
use gameshelf_lib::db::Database;
use std::time::Instant;

/// Generates 1,000 synthetic games across platforms, genres, and years
fn generate_1000_synthetic_games() -> Vec<Game> {
    let mut games = Vec::with_capacity(1000);

    let prefixes = [
        "Super",
        "Chronicles of",
        "The Legend of",
        "Cyber",
        "Shadow",
        "Final",
        "Age of",
        "Dark",
        "Star",
        "Mega",
    ];
    let nouns = [
        "Warrior", "Fantasy", "Empire", "Odyssey", "Quest", "Strike", "Galaxy", "Protocol",
        "Racer", "Kingdom",
    ];
    let suffixes = [
        "Origins",
        "Reborn",
        "2026",
        "Zero",
        "Legacy",
        "Arena",
        "Infinity",
        "Tactics",
        "Prime",
        "Unlimited",
    ];
    let developers = [
        "Valve",
        "Square Enix",
        "Capcom",
        "Nintendo",
        "FromSoftware",
        "Bandai Namco",
        "Bethesda",
        "Ubisoft",
        "EA",
        "CD Projekt Red",
    ];
    let genres_list = [
        vec!["Action".to_string(), "Adventure".to_string()],
        vec!["RPG".to_string(), "Strategy".to_string()],
        vec!["Shooter".to_string(), "Sci-Fi".to_string()],
        vec!["Platformer".to_string(), "Retro".to_string()],
        vec!["Simulation".to_string(), "Casual".to_string()],
    ];

    for i in 1..=1000 {
        let p = prefixes[i % prefixes.len()];
        let n = nouns[(i * 3) % nouns.len()];
        let s = suffixes[(i * 7) % suffixes.len()];
        let title = format!("{} {} {}: Edition {}", p, n, s, i);
        let sort_title = title.to_lowercase();
        let dev = developers[i % developers.len()];
        let genres = genres_list[i % genres_list.len()].clone();
        let release_year = 1990 + (i as i32 % 35);

        let (source_kind, launch_action) = if i % 3 == 0 {
            (
                SourceKind::Steam,
                LaunchAction::Steam {
                    app_id: 100000 + i as u32,
                },
            )
        } else if i % 3 == 1 {
            (
                SourceKind::Standalone,
                LaunchAction::Executable {
                    path: format!("C:/Games/Game_{}/game_{}.exe", i, i),
                    args: vec!["-fullscreen".to_string()],
                    working_dir: Some(format!("C:/Games/Game_{}", i)),
                    env: None,
                },
            )
        } else {
            (
                SourceKind::Emulated,
                LaunchAction::EmulatedGame {
                    profile_id: "retroarch".to_string(),
                    rom_path: format!("D:/Roms/SNES/game_{}.sfc", i),
                    arg_overrides: None,
                },
            )
        };

        games.push(Game {
            id: format!("synth-game-{:04}", i),
            title,
            sort_title,
            description: Some(format!(
                "Synthetic game #{} for 1000-game library benchmark.",
                i
            )),
            developer: Some(dev.to_string()),
            publisher: Some(dev.to_string()),
            release_year: Some(release_year),
            genres,
            tags: vec!["Benchmark".to_string(), format!("Tag{}", i % 20)],
            source_kind,
            source_id: Some(format!("{}", 100000 + i)),
            install_dir: Some(format!("C:/Games/Game_{}", i)),
            launch_action,
            status: GameStatus::Installed,
            last_scanned_at: Some("2026-10-10T00:00:00Z".to_string()),
            is_favorite: i % 10 == 0,
            is_hidden: false,
            notes: if i % 5 == 0 {
                Some("Benchmarked title notes".to_string())
            } else {
                None
            },
            user_tags: vec![format!("UserTag{}", i % 10)],
            match_confidence: Some(0.95),
            provider_attribution: Some("Benchmark".to_string()),
            last_launched_at: if i % 4 == 0 {
                Some("2026-10-09T00:00:00Z".to_string())
            } else {
                None
            },
            normalized_path: Some(format!("c:/games/game_{}/game_{}.exe", i, i)),
            created_at: "2026-10-10T00:00:00Z".to_string(),
            playtime_seconds: (i * 10) as u64,
            session_count: (i % 5) as u32,
            last_played_at: None,
            artwork: None,
        });
    }

    games
}

#[test]
fn test_benchmark_1000_synthetic_games_persistence_and_queries() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("benchmark.db");
    let db = Database::new(&db_path).unwrap();

    let games = generate_1000_synthetic_games();
    assert_eq!(games.len(), 1000);

    // 1. Measure insertion of 1,000 synthetic games
    let start_insert = Instant::now();
    for game in &games {
        db.add_game(game).unwrap();
    }
    let insert_duration = start_insert.elapsed();
    println!(
        "PERF: Inserted 1,000 synthetic games in {:?}",
        insert_duration
    );

    // 2. Measure retrieval of all 1,000 games
    let start_query_all = Instant::now();
    let retrieved = db.list_games(None, None, None, None, false).unwrap();
    let query_all_duration = start_query_all.elapsed();
    assert_eq!(retrieved.len(), 1000);
    println!("PERF: Retrieved 1,000 games in {:?}", query_all_duration);
    assert!(
        query_all_duration.as_millis() < 250,
        "Retrieving 1,000 games took too long: {:?}",
        query_all_duration
    );

    // 3. Measure title search across 1,000 games
    let start_search = Instant::now();
    let search_results = db
        .list_games(None, Some("Cyber"), None, None, false)
        .unwrap();
    let search_duration = start_search.elapsed();
    assert!(!search_results.is_empty());
    println!(
        "PERF: Searched 1,000 games for 'Cyber' ({}) in {:?}",
        search_results.len(),
        search_duration
    );
    assert!(
        search_duration.as_millis() < 50,
        "Searching 1,000 games took too long: {:?}",
        search_duration
    );

    // 4. Measure filter queries (e.g. steam games)
    let start_steam = Instant::now();
    let steam_games = db
        .list_games(Some("steam"), None, None, None, false)
        .unwrap();
    let steam_duration = start_steam.elapsed();
    assert!(!steam_games.is_empty());
    println!(
        "PERF: Filtered Steam games ({}) in {:?}",
        steam_games.len(),
        steam_duration
    );

    // 5. Verify integrity after 1,000 inserts
    assert!(db.check_integrity().unwrap());
}

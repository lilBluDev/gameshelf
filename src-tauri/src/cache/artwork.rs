use reqwest::Client;
use serde::Serialize;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use tracing::{debug, info, warn};

use crate::error::{AppError, AppResult};
use crate::metadata::provider::ArtworkRole;

pub const MAX_IMAGE_SIZE_BYTES: usize = 20 * 1024 * 1024; // 20 MB cap

#[derive(Debug, Clone, Serialize)]
pub struct CacheStats {
    pub file_count: usize,
    pub total_bytes: u64,
    pub formatted_size: String,
}

#[derive(Debug, Clone)]
pub struct DownloadedArtwork {
    pub cached_path: PathBuf,
    pub width: i32,
    pub height: i32,
    pub mime_type: String,
}

pub struct ArtworkCache {
    cache_dir: PathBuf,
    http_client: Client,
}

impl ArtworkCache {
    pub fn new<P: AsRef<Path>>(cache_dir: P) -> AppResult<Self> {
        let dir = cache_dir.as_ref().to_path_buf();
        fs::create_dir_all(&dir)?;

        let http_client = Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .unwrap_or_else(|_| Client::new());

        Ok(Self {
            cache_dir: dir,
            http_client,
        })
    }

    pub fn cache_dir(&self) -> &Path {
        &self.cache_dir
    }

    /// Download artwork asset, validate MIME, size cap (20MB), and image decoding,
    /// write atomically via temp file, and return metadata.
    pub async fn download_and_validate(
        &self,
        game_id: &str,
        role: ArtworkRole,
        asset_id: &str,
        source_url: &str,
    ) -> AppResult<DownloadedArtwork> {
        debug!(url = %source_url, game_id = %game_id, "Downloading artwork asset");

        let response =
            self.http_client.get(source_url).send().await.map_err(|e| {
                AppError::Network(format!("Failed to connect to artwork host: {}", e))
            })?;

        let status = response.status();
        if !status.is_success() {
            return Err(AppError::ArtworkValidation(format!(
                "Artwork host returned HTTP {}",
                status
            )));
        }

        // Check Content-Length header if provided
        if let Some(len) = response.content_length() {
            if len as usize > MAX_IMAGE_SIZE_BYTES {
                return Err(AppError::ArtworkValidation(format!(
                    "Image exceeds 20MB size limit (got {} bytes)",
                    len
                )));
            }
        }

        // Content-Type verification
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_lowercase();

        let ext = match content_type.as_str() {
            "image/jpeg" | "image/jpg" => "jpg",
            "image/png" => "png",
            "image/webp" => "webp",
            _ => {
                // Infer from url if content-type is generic octet-stream
                let url_lower = source_url.to_lowercase();
                if url_lower.ends_with(".png") {
                    "png"
                } else if url_lower.ends_with(".webp") {
                    "webp"
                } else if url_lower.ends_with(".jpg") || url_lower.ends_with(".jpeg") {
                    "jpg"
                } else {
                    return Err(AppError::ArtworkValidation(format!(
                        "Unsupported image MIME type: '{}'",
                        content_type
                    )));
                }
            }
        };

        // Download bytes with size cap
        let bytes = response
            .bytes()
            .await
            .map_err(|e| AppError::Network(format!("Failed to download artwork body: {}", e)))?;

        if bytes.len() > MAX_IMAGE_SIZE_BYTES {
            return Err(AppError::ArtworkValidation(format!(
                "Image exceeds 20MB size limit (got {} bytes)",
                bytes.len()
            )));
        }

        // Validate decoded image structure and dimensions using `image` crate
        let img = image::load_from_memory(&bytes).map_err(|e| {
            AppError::ArtworkValidation(format!("Image decoding validation failed: {}", e))
        })?;

        let width = img.width() as i32;
        let height = img.height() as i32;

        let mime_type = match ext {
            "png" => "image/png",
            "webp" => "image/webp",
            _ => "image/jpeg",
        }
        .to_string();

        // Target filename: {game_id}_{role}_{safe_asset_id}.{ext}
        let safe_asset_id: String = asset_id
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        let safe_game_id: String = game_id
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .collect();

        let filename = format!(
            "{}_{}_{}.{}",
            safe_game_id,
            role.as_str(),
            safe_asset_id,
            ext
        );
        let final_path = self.cache_dir.join(&filename);
        let tmp_path = self.cache_dir.join(format!("{}.tmp", filename));

        // Atomic file write: write to .tmp, flush, sync, then rename
        {
            let mut file = File::create(&tmp_path)?;
            file.write_all(&bytes)?;
            file.flush()?;
            file.sync_all()?;
        }

        fs::rename(&tmp_path, &final_path)?;

        info!(
            path = ?final_path,
            width = width,
            height = height,
            "Artwork successfully cached and validated"
        );

        Ok(DownloadedArtwork {
            cached_path: final_path,
            width,
            height,
            mime_type,
        })
    }

    /// Import a local image file selected by the user into the cache
    pub fn import_local_image(
        &self,
        game_id: &str,
        role: ArtworkRole,
        local_path: &Path,
    ) -> AppResult<DownloadedArtwork> {
        if !local_path.exists() {
            return Err(AppError::InvalidArgument(format!(
                "Local image file does not exist: {:?}",
                local_path
            )));
        }

        let bytes = fs::read(local_path)?;
        if bytes.len() > MAX_IMAGE_SIZE_BYTES {
            return Err(AppError::ArtworkValidation(format!(
                "Selected image exceeds 20MB limit (got {} bytes)",
                bytes.len()
            )));
        }

        let img = image::load_from_memory(&bytes).map_err(|e| {
            AppError::ArtworkValidation(format!("Invalid image file format: {}", e))
        })?;

        let width = img.width() as i32;
        let height = img.height() as i32;

        let ext = local_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png")
            .to_lowercase();

        let mime_type = match ext.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            _ => "image/png",
        }
        .to_string();

        let safe_game_id: String = game_id
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
            .collect();
        let timestamp = chrono::Utc::now().timestamp_millis();
        let filename = format!(
            "{}_{}_local_{}.{}",
            safe_game_id,
            role.as_str(),
            timestamp,
            ext
        );

        let final_path = self.cache_dir.join(&filename);
        let tmp_path = self.cache_dir.join(format!("{}.tmp", filename));

        {
            let mut file = File::create(&tmp_path)?;
            file.write_all(&bytes)?;
            file.flush()?;
            file.sync_all()?;
        }

        fs::rename(&tmp_path, &final_path)?;

        info!(
            path = ?final_path,
            width = width,
            height = height,
            "Local artwork successfully copied to cache"
        );

        Ok(DownloadedArtwork {
            cached_path: final_path,
            width,
            height,
            mime_type,
        })
    }

    /// Compute disk cache statistics (total files and byte size)
    pub fn get_stats(&self) -> AppResult<CacheStats> {
        let mut file_count = 0;
        let mut total_bytes = 0u64;

        if self.cache_dir.exists() {
            if let Ok(entries) = fs::read_dir(&self.cache_dir) {
                for entry in entries.flatten() {
                    if let Ok(meta) = entry.metadata() {
                        if meta.is_file() {
                            file_count += 1;
                            total_bytes += meta.len();
                        }
                    }
                }
            }
        }

        let formatted_size = format_byte_size(total_bytes);

        Ok(CacheStats {
            file_count,
            total_bytes,
            formatted_size,
        })
    }

    /// Clear all files in the artwork cache directory
    pub fn clear_cache(&self) -> AppResult<usize> {
        let mut deleted_count = 0;
        if self.cache_dir.exists() {
            if let Ok(entries) = fs::read_dir(&self.cache_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Err(e) = fs::remove_file(&path) {
                            warn!(path = ?path, error = ?e, "Failed to remove cached artwork file");
                        } else {
                            deleted_count += 1;
                        }
                    }
                }
            }
        }
        info!(deleted_count = deleted_count, "Artwork cache cleared");
        Ok(deleted_count)
    }
}

pub fn format_byte_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_format_byte_size() {
        assert_eq!(format_byte_size(500), "500 B");
        assert_eq!(format_byte_size(1536), "1.5 KB");
        assert_eq!(format_byte_size(15 * 1024 * 1024), "15.0 MB");
    }

    #[test]
    fn test_cache_stats_and_clear() {
        let dir = tempdir().unwrap();
        let cache = ArtworkCache::new(dir.path()).unwrap();

        // Initially empty
        let s1 = cache.get_stats().unwrap();
        assert_eq!(s1.file_count, 0);
        assert_eq!(s1.total_bytes, 0);

        // Write a test dummy file
        let f1 = dir.path().join("dummy.jpg");
        fs::write(&f1, b"hello artwork").unwrap();

        let s2 = cache.get_stats().unwrap();
        assert_eq!(s2.file_count, 1);
        assert_eq!(s2.total_bytes, 13);

        // Clear cache
        let cleared = cache.clear_cache().unwrap();
        assert_eq!(cleared, 1);

        let s3 = cache.get_stats().unwrap();
        assert_eq!(s3.file_count, 0);
    }
}

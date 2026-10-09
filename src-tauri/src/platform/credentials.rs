use keyring::Entry;
use tracing::{debug, info, warn};

use crate::error::{AppError, AppResult};

const SERVICE_NAME: &str = "GameShelf";
const STEAMGRIDDB_USER: &str = "steamgriddb_api_key";

/// Retrieve the SteamGridDB API key securely from Windows Credential Manager.
/// Returns Ok(None) if no key is stored.
pub fn get_steamgriddb_key() -> AppResult<Option<String>> {
    let entry = Entry::new(SERVICE_NAME, STEAMGRIDDB_USER)
        .map_err(|e| AppError::Keyring(format!("Failed to initialize keyring entry: {}", e)))?;

    match entry.get_password() {
        Ok(key) => {
            if key.trim().is_empty() {
                Ok(None)
            } else {
                debug!("Retrieved SteamGridDB API key from credential manager");
                Ok(Some(key))
            }
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => {
            warn!(error = ?e, "Failed to read SteamGridDB API key from credential manager");
            Err(AppError::Keyring(format!(
                "Failed to read key from credential manager: {}",
                e
            )))
        }
    }
}

/// Store the SteamGridDB API key securely into Windows Credential Manager.
/// Strips surrounding whitespace and never logs the key value.
pub fn set_steamgriddb_key(key: &str) -> AppResult<()> {
    let clean_key = key.trim();
    if clean_key.is_empty() {
        return delete_steamgriddb_key();
    }

    let entry = Entry::new(SERVICE_NAME, STEAMGRIDDB_USER)
        .map_err(|e| AppError::Keyring(format!("Failed to initialize keyring entry: {}", e)))?;

    entry.set_password(clean_key).map_err(|e| {
        warn!(error = ?e, "Failed to save SteamGridDB API key to credential manager");
        AppError::Keyring(format!("Failed to save key to credential manager: {}", e))
    })?;

    info!("SteamGridDB API key successfully saved in credential manager");
    Ok(())
}

/// Delete the SteamGridDB API key from Windows Credential Manager.
pub fn delete_steamgriddb_key() -> AppResult<()> {
    let entry = Entry::new(SERVICE_NAME, STEAMGRIDDB_USER)
        .map_err(|e| AppError::Keyring(format!("Failed to initialize keyring entry: {}", e)))?;

    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => {
            info!("SteamGridDB API key removed from credential manager");
            Ok(())
        }
        Err(e) => {
            warn!(error = ?e, "Failed to remove SteamGridDB API key from credential manager");
            Err(AppError::Keyring(format!(
                "Failed to delete key from credential manager: {}",
                e
            )))
        }
    }
}

/// Check if a SteamGridDB API key exists in Windows Credential Manager.
pub fn has_steamgriddb_key() -> AppResult<bool> {
    match get_steamgriddb_key() {
        Ok(Some(k)) => Ok(!k.trim().is_empty()),
        Ok(None) => Ok(false),
        Err(e) => Err(e),
    }
}

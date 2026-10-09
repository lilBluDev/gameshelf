use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Migration failed at version {version}: {reason}")]
    MigrationFailed { version: u32, reason: String },

    #[error("Setting not found: {0}")]
    SettingNotFound(String),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("CommandError", 3)?;

        let code = match self {
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::Io(_) => "IO_ERROR",
            AppError::Serialization(_) => "SERIALIZATION_ERROR",
            AppError::MigrationFailed { .. } => "MIGRATION_ERROR",
            AppError::SettingNotFound(_) => "SETTING_NOT_FOUND",
            AppError::InvalidArgument(_) => "INVALID_ARGUMENT",
            AppError::Internal(_) => "INTERNAL_ERROR",
        };

        state.serialize_field("code", code)?;
        state.serialize_field("message", &self.to_string())?;
        state.serialize_field("details", &format!("{:?}", self))?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

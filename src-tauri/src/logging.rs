use std::path::Path;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Layer};

pub fn setup_logging<P: AsRef<Path>>(log_dir: P) -> Result<(), Box<dyn std::error::Error>> {
    let log_path = log_dir.as_ref();
    std::fs::create_dir_all(log_path)?;

    // Daily rotating log file appender: gameshelf.YYYY-MM-DD.log
    let file_appender = tracing_appender::rolling::daily(log_path, "gameshelf.log");
    let (non_blocking_file, _guard) = tracing_appender::non_blocking(file_appender);

    // Keep the guard alive across the application lifecycle by leaking it safely
    Box::leak(Box::new(_guard));

    let file_layer = tracing_subscriber::fmt::layer()
        .with_writer(non_blocking_file)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(true)
        .with_filter(EnvFilter::new("info,gameshelf=debug"));

    let stdout_layer = tracing_subscriber::fmt::layer()
        .with_ansi(true)
        .with_target(false)
        .with_filter(EnvFilter::new("info,gameshelf=debug"));

    tracing_subscriber::registry()
        .with(stdout_layer)
        .with(file_layer)
        .try_init()?;

    Ok(())
}

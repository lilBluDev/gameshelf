use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tauri::Emitter;
use tokio::sync::{watch, Mutex};

use crate::db::schema::Game;
use crate::db::Database;
use crate::error::AppResult;

pub trait ProcessMonitor: Send + Sync {
    fn is_running(&self) -> bool;
    fn tracking_method(&self) -> &str;
    fn stop(&self);
}

pub struct FakeProcessMonitor {
    running: AtomicBool,
    method: String,
}

impl FakeProcessMonitor {
    pub fn new(running: bool, method: &str) -> Self {
        Self {
            running: AtomicBool::new(running),
            method: method.to_string(),
        }
    }

    pub fn set_running(&self, running: bool) {
        self.running.store(running, Ordering::SeqCst);
    }
}

impl ProcessMonitor for FakeProcessMonitor {
    fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    fn tracking_method(&self) -> &str {
        &self.method
    }

    fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

pub struct ChildProcessMonitor {
    child: std::sync::Mutex<std::process::Child>,
    stopped: AtomicBool,
}

impl ChildProcessMonitor {
    pub fn new(child: std::process::Child) -> Self {
        Self {
            child: std::sync::Mutex::new(child),
            stopped: AtomicBool::new(false),
        }
    }
}

impl ProcessMonitor for ChildProcessMonitor {
    fn is_running(&self) -> bool {
        if self.stopped.load(Ordering::SeqCst) {
            return false;
        }
        if let Ok(mut lock) = self.child.lock() {
            matches!(lock.try_wait(), Ok(None))
        } else {
            false
        }
    }

    fn tracking_method(&self) -> &str {
        "process_tree"
    }

    fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
    }
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn CreateJobObjectW(lp_job_attributes: *const std::ffi::c_void, lp_name: *const u16) -> isize;
    fn AssignProcessToJobObject(h_job: isize, h_process: isize) -> i32;
    fn QueryInformationJobObject(
        h_job: isize,
        job_object_information_class: i32,
        lp_job_object_information: *mut std::ffi::c_void,
        cb_job_object_information_length: u32,
        lp_return_length: *mut u32,
    ) -> i32;
    fn CloseHandle(h_object: isize) -> i32;
}

#[repr(C)]
#[derive(Default)]
struct JobObjectBasicAccountingInformationData {
    total_user_time: i64,
    total_kernel_time: i64,
    this_period_total_user_time: i64,
    this_period_total_kernel_time: i64,
    total_page_fault_count: u32,
    total_processes: u32,
    active_processes: u32,
    total_terminated_processes: u32,
}

#[cfg(windows)]
pub struct JobObjectMonitor {
    job_handle: isize,
    stopped: AtomicBool,
}

#[cfg(windows)]
impl JobObjectMonitor {
    pub fn from_child(child: &std::process::Child) -> Option<Self> {
        use std::os::windows::io::AsRawHandle;

        let job = unsafe { CreateJobObjectW(core::ptr::null(), core::ptr::null()) };
        if job == 0 {
            return None;
        }

        let raw_handle = child.as_raw_handle() as isize;
        let assign_ok = unsafe { AssignProcessToJobObject(job, raw_handle) };
        if assign_ok == 0 {
            unsafe {
                CloseHandle(job);
            }
            return None;
        }

        Some(Self {
            job_handle: job,
            stopped: AtomicBool::new(false),
        })
    }
}

#[cfg(windows)]
impl ProcessMonitor for JobObjectMonitor {
    fn is_running(&self) -> bool {
        if self.stopped.load(Ordering::SeqCst) {
            return false;
        }
        if self.job_handle == 0 {
            return false;
        }

        let mut info = JobObjectBasicAccountingInformationData::default();
        let mut ret_len: u32 = 0;
        let ok = unsafe {
            QueryInformationJobObject(
                self.job_handle,
                1,
                &mut info as *mut _ as *mut _,
                core::mem::size_of::<JobObjectBasicAccountingInformationData>() as u32,
                &mut ret_len,
            )
        };

        if ok != 0 {
            info.active_processes > 0
        } else {
            false
        }
    }

    fn tracking_method(&self) -> &str {
        "process_tree"
    }

    fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
    }
}

#[cfg(windows)]
impl Drop for JobObjectMonitor {
    fn drop(&mut self) {
        if self.job_handle != 0 {
            unsafe {
                CloseHandle(self.job_handle);
            }
        }
    }
}

#[cfg(windows)]
unsafe impl Send for JobObjectMonitor {}
#[cfg(windows)]
unsafe impl Sync for JobObjectMonitor {}

pub trait SteamSource: Send + Sync {
    fn running_app_id(&self) -> Option<u32>;
    fn is_install_dir_running(&self, install_dir: Option<&str>) -> bool;
}

pub struct FakeSteamSource {
    running_id: AtomicU32,
    dir_running: AtomicBool,
}

impl FakeSteamSource {
    pub fn new(initial_id: u32, dir_running: bool) -> Self {
        Self {
            running_id: AtomicU32::new(initial_id),
            dir_running: AtomicBool::new(dir_running),
        }
    }

    pub fn set_running_id(&self, id: u32) {
        self.running_id.store(id, Ordering::SeqCst);
    }

    pub fn set_dir_running(&self, running: bool) {
        self.dir_running.store(running, Ordering::SeqCst);
    }
}

impl SteamSource for FakeSteamSource {
    fn running_app_id(&self) -> Option<u32> {
        let val = self.running_id.load(Ordering::SeqCst);
        if val > 0 {
            Some(val)
        } else {
            None
        }
    }

    fn is_install_dir_running(&self, _install_dir: Option<&str>) -> bool {
        self.dir_running.load(Ordering::SeqCst)
    }
}

pub struct WindowsSteamSource;

impl SteamSource for WindowsSteamSource {
    fn running_app_id(&self) -> Option<u32> {
        #[cfg(windows)]
        {
            use winreg::enums::HKEY_CURRENT_USER;
            use winreg::RegKey;

            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            if let Ok(steam_key) = hkcu.open_subkey("Software\\Valve\\Steam") {
                if let Ok(id) = steam_key.get_value::<u32, _>("RunningAppID") {
                    if id > 0 {
                        return Some(id);
                    }
                }
            }
        }
        None
    }

    fn is_install_dir_running(&self, install_dir: Option<&str>) -> bool {
        let dir = match install_dir {
            Some(d) if !d.trim().is_empty() => std::path::Path::new(d),
            _ => return false,
        };
        dir.exists()
    }
}

pub struct SteamProcessMonitor {
    target_app_id: u32,
    install_dir: Option<String>,
    source: Box<dyn SteamSource>,
    method: std::sync::RwLock<String>,
    stopped: AtomicBool,
    has_seen_active: AtomicBool,
    start_instant: Instant,
}

impl SteamProcessMonitor {
    pub fn new(
        target_app_id: u32,
        install_dir: Option<String>,
        source: Box<dyn SteamSource>,
    ) -> Self {
        Self {
            target_app_id,
            install_dir,
            source,
            method: std::sync::RwLock::new("steam_running_app".to_string()),
            stopped: AtomicBool::new(false),
            has_seen_active: AtomicBool::new(false),
            start_instant: Instant::now(),
        }
    }
}

impl ProcessMonitor for SteamProcessMonitor {
    fn is_running(&self) -> bool {
        if self.stopped.load(Ordering::SeqCst) {
            return false;
        }

        if let Some(id) = self.source.running_app_id() {
            if id == self.target_app_id {
                self.has_seen_active.store(true, Ordering::SeqCst);
                if let Ok(mut m) = self.method.write() {
                    *m = "steam_running_app".to_string();
                }
                return true;
            }
        }

        if self
            .source
            .is_install_dir_running(self.install_dir.as_deref())
        {
            self.has_seen_active.store(true, Ordering::SeqCst);
            if let Ok(mut m) = self.method.write() {
                *m = "install_dir_match".to_string();
            }
            return true;
        }

        if !self.has_seen_active.load(Ordering::SeqCst)
            && self.start_instant.elapsed().as_secs() < 15
        {
            return true;
        }

        false
    }

    fn tracking_method(&self) -> &str {
        if let Ok(m) = self.method.read() {
            if m.as_str() == "install_dir_match" {
                return "install_dir_match";
            }
        }
        "steam_running_app"
    }

    fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ActiveSessionInfo {
    pub session_id: String,
    pub game_id: String,
    pub started_at: String,
    pub tracking_method: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionStartedPayload {
    pub session_id: String,
    pub game_id: String,
    pub started_at: String,
    pub tracking_method: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionEndedPayload {
    pub session_id: String,
    pub game_id: String,
    pub duration_secs: u64,
    pub end_reason: String,
}

pub struct ActiveSession {
    pub session_id: String,
    pub game_id: String,
    pub started_at: String,
    pub tracking_method: String,
    pub monitor: Arc<dyn ProcessMonitor>,
    pub cancel_sender: watch::Sender<bool>,
}

pub struct PlaytimeManager {
    db: Arc<Database>,
    app_handle: std::sync::RwLock<Option<tauri::AppHandle>>,
    active_sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
}

impl PlaytimeManager {
    pub fn new(db: Arc<Database>, app_handle: Option<tauri::AppHandle>) -> Self {
        Self {
            db,
            app_handle: std::sync::RwLock::new(app_handle),
            active_sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn set_app_handle(&self, handle: tauri::AppHandle) {
        if let Ok(mut lock) = self.app_handle.write() {
            *lock = Some(handle);
        }
    }

    pub async fn start_child_session(
        &self,
        game: &Game,
        child: std::process::Child,
    ) -> AppResult<Option<String>> {
        #[cfg(windows)]
        let monitor: Arc<dyn ProcessMonitor> = match JobObjectMonitor::from_child(&child) {
            Some(job_monitor) => Arc::new(job_monitor),
            None => Arc::new(ChildProcessMonitor::new(child)),
        };

        #[cfg(not(windows))]
        let monitor: Arc<dyn ProcessMonitor> = Arc::new(ChildProcessMonitor::new(child));

        self.start_custom_session(&game.id, monitor).await
    }

    pub async fn start_steam_session(&self, game: &Game, app_id: u32) -> AppResult<Option<String>> {
        let monitor = Arc::new(SteamProcessMonitor::new(
            app_id,
            game.install_dir.clone(),
            Box::new(WindowsSteamSource),
        ));
        self.start_custom_session(&game.id, monitor).await
    }

    pub async fn start_custom_session(
        &self,
        game_id: &str,
        monitor: Arc<dyn ProcessMonitor>,
    ) -> AppResult<Option<String>> {
        let enabled = self
            .db
            .get_setting("playtime_tracking_enabled")?
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        if !enabled {
            return Ok(None);
        }

        let mut lock = self.active_sessions.lock().await;
        if let Some(existing) = lock.get(game_id) {
            return Ok(Some(existing.session_id.clone()));
        }

        let now = chrono::Utc::now().to_rfc3339();
        let tracking_method = monitor.tracking_method().to_string();
        let session = self
            .db
            .create_play_session(game_id, &now, &tracking_method)?;
        let session_id = session.id.clone();

        let (cancel_sender, mut cancel_receiver) = watch::channel(false);

        let active_session = ActiveSession {
            session_id: session_id.clone(),
            game_id: game_id.to_string(),
            started_at: now.clone(),
            tracking_method: tracking_method.clone(),
            monitor: monitor.clone(),
            cancel_sender,
        };

        lock.insert(game_id.to_string(), active_session);
        drop(lock);

        if let Ok(app_opt) = self.app_handle.read() {
            if let Some(app) = app_opt.as_ref() {
                let _ = app.emit(
                    "playtime-session-started",
                    SessionStartedPayload {
                        session_id: session_id.clone(),
                        game_id: game_id.to_string(),
                        started_at: now,
                        tracking_method,
                    },
                );
            }
        }

        let db_clone = self.db.clone();
        let app_handle_opt = self.app_handle.read().ok().and_then(|h| h.clone());
        let active_sessions_clone = self.active_sessions.clone();
        let sid = session_id.clone();
        let gid = game_id.to_string();

        tokio::spawn(async move {
            let mut tick_count: u64 = 0;
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(tokio::time::Duration::from_secs(2)) => {
                        if *cancel_receiver.borrow() {
                            break;
                        }
                        if monitor.is_running() {
                            tick_count += 1;
                            if tick_count.is_multiple_of(15) {
                                let heartbeat = chrono::Utc::now().to_rfc3339();
                                let _ = db_clone.heartbeat_play_session(&sid, &heartbeat);
                            }
                        } else {
                            let ended_at = chrono::Utc::now().to_rfc3339();
                            let closed = db_clone.close_play_session(&sid, &ended_at, "exited").ok().flatten();
                            let duration = closed.map(|c| c.duration_secs).unwrap_or(0);

                            let mut sessions_lock = active_sessions_clone.lock().await;
                            sessions_lock.remove(&gid);
                            drop(sessions_lock);

                            if let Some(app) = app_handle_opt.as_ref() {
                                let _ = app.emit(
                                    "playtime-session-ended",
                                    SessionEndedPayload {
                                        session_id: sid,
                                        game_id: gid,
                                        duration_secs: duration,
                                        end_reason: "exited".to_string(),
                                    },
                                );
                            }
                            break;
                        }
                    }
                    _ = cancel_receiver.changed() => {
                        if *cancel_receiver.borrow() {
                            break;
                        }
                    }
                }
            }
        });

        Ok(Some(session_id))
    }

    pub async fn stop_session(&self, game_id: &str, reason: &str) -> AppResult<()> {
        let mut lock = self.active_sessions.lock().await;
        if let Some(session) = lock.remove(game_id) {
            session.monitor.stop();
            let _ = session.cancel_sender.send(true);
            let ended_at = chrono::Utc::now().to_rfc3339();
            let closed = self
                .db
                .close_play_session(&session.session_id, &ended_at, reason)?;
            let duration = closed.map(|c| c.duration_secs).unwrap_or(0);

            if let Ok(app_opt) = self.app_handle.read() {
                if let Some(app) = app_opt.as_ref() {
                    let _ = app.emit(
                        "playtime-session-ended",
                        SessionEndedPayload {
                            session_id: session.session_id,
                            game_id: game_id.to_string(),
                            duration_secs: duration,
                            end_reason: reason.to_string(),
                        },
                    );
                }
            }
        }
        Ok(())
    }

    pub async fn get_active_sessions(&self) -> Vec<ActiveSessionInfo> {
        let lock = self.active_sessions.lock().await;
        lock.values()
            .map(|s| ActiveSessionInfo {
                session_id: s.session_id.clone(),
                game_id: s.game_id.clone(),
                started_at: s.started_at.clone(),
                tracking_method: s.tracking_method.clone(),
            })
            .collect()
    }

    pub async fn shutdown(&self) {
        let mut lock = self.active_sessions.lock().await;
        let ended_at = chrono::Utc::now().to_rfc3339();
        for (_, session) in lock.drain() {
            session.monitor.stop();
            let _ = session.cancel_sender.send(true);
            let _ = self
                .db
                .close_play_session(&session.session_id, &ended_at, "interrupted");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::schema::{Game, GameStatus, LaunchAction, SourceKind};

    fn make_test_game(id: &str, title: &str) -> Game {
        Game {
            id: id.to_string(),
            title: title.to_string(),
            sort_title: title.to_lowercase(),
            description: None,
            developer: None,
            publisher: None,
            release_year: None,
            genres: vec![],
            tags: vec![],
            source_kind: SourceKind::Standalone,
            source_id: None,
            install_dir: None,
            launch_action: LaunchAction::Unavailable {
                reason: "Test".to_string(),
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
        }
    }

    #[tokio::test]
    async fn test_tracking_disabled_does_not_start_session() {
        let db = Arc::new(Database::in_memory().unwrap());
        db.set_setting("playtime_tracking_enabled", "false")
            .unwrap();
        let manager = PlaytimeManager::new(db.clone(), None);

        let monitor = Arc::new(FakeProcessMonitor::new(true, "process_tree"));
        let res = manager
            .start_custom_session("game-off", monitor)
            .await
            .unwrap();
        assert!(res.is_none());
        assert_eq!(manager.get_active_sessions().await.len(), 0);
        assert_eq!(db.get_play_sessions("game-off").unwrap().len(), 0);
    }

    #[tokio::test]
    async fn test_session_lifecycle_with_fake_monitor() {
        let db = Arc::new(Database::in_memory().unwrap());
        db.set_setting("playtime_tracking_enabled", "true").unwrap();
        let game = make_test_game("game-live", "Live Game");
        db.add_game(&game).unwrap();

        let manager = PlaytimeManager::new(db.clone(), None);
        let monitor = Arc::new(FakeProcessMonitor::new(true, "process_tree"));

        let session_id_opt = manager
            .start_custom_session("game-live", monitor.clone())
            .await
            .unwrap();
        assert!(session_id_opt.is_some());
        let session_id = session_id_opt.unwrap();

        let active = manager.get_active_sessions().await;
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].game_id, "game-live");

        db.heartbeat_play_session(&session_id, "2026-10-10T12:00:30Z")
            .unwrap();

        monitor.set_running(false);
        tokio::time::sleep(tokio::time::Duration::from_millis(2500)).await;

        let active_after = manager.get_active_sessions().await;
        assert_eq!(active_after.len(), 0);
    }

    #[tokio::test]
    async fn test_stop_tracking_ends_session_with_stopped_by_user() {
        let db = Arc::new(Database::in_memory().unwrap());
        db.set_setting("playtime_tracking_enabled", "true").unwrap();
        let game = make_test_game("game-stop", "Stop Game");
        db.add_game(&game).unwrap();

        let manager = PlaytimeManager::new(db.clone(), None);
        let monitor = Arc::new(FakeProcessMonitor::new(true, "process_tree"));

        let sid = manager
            .start_custom_session("game-stop", monitor.clone())
            .await
            .unwrap()
            .unwrap();

        tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

        let past = chrono::Utc::now() - chrono::Duration::seconds(30);
        let past_rfc = past.to_rfc3339();
        let conn = db.conn_for_test();
        conn.execute(
            "UPDATE play_sessions SET started_at = ?1 WHERE id = ?2",
            rusqlite::params![past_rfc, sid],
        )
        .unwrap();
        drop(conn);

        manager
            .stop_session("game-stop", "stopped_by_user")
            .await
            .unwrap();

        let active = manager.get_active_sessions().await;
        assert_eq!(active.len(), 0);

        let sessions = db.get_play_sessions("game-stop").unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].end_reason, Some("stopped_by_user".to_string()));
        assert!(sessions[0].duration_secs >= 15);

        let updated_game = db.get_game_by_id("game-stop").unwrap().unwrap();
        assert!(updated_game.playtime_seconds >= 15);
        assert_eq!(updated_game.session_count, 1);
    }

    #[test]
    fn test_steam_detection_logic_against_fake_source() {
        let fake_source = Box::new(FakeSteamSource::new(0, false));
        let monitor = SteamProcessMonitor::new(440, Some("c:/games/tf2".to_string()), fake_source);

        assert_eq!(monitor.tracking_method(), "steam_running_app");
        assert!(monitor.is_running());

        let fake_matched = Box::new(FakeSteamSource::new(440, false));
        let monitor_matched =
            SteamProcessMonitor::new(440, Some("c:/games/tf2".to_string()), fake_matched);
        assert!(monitor_matched.is_running());
        assert_eq!(monitor_matched.tracking_method(), "steam_running_app");

        let fake_dir = Box::new(FakeSteamSource::new(0, true));
        let monitor_dir = SteamProcessMonitor::new(440, Some("c:/games/tf2".to_string()), fake_dir);
        assert!(monitor_dir.is_running());
        assert_eq!(monitor_dir.tracking_method(), "install_dir_match");
    }

    #[test]
    #[cfg(windows)]
    fn test_job_object_grandchild_process_tree() {
        let mut cmd = std::process::Command::new("powershell.exe");
        cmd.args([
            "-NoProfile",
            "-Command",
            "Start-Process powershell.exe -ArgumentList '-NoProfile','-Command','Start-Sleep -Milliseconds 600'; Start-Sleep -Milliseconds 80",
        ]);

        let child = match cmd.spawn() {
            Ok(c) => c,
            Err(_) => return,
        };

        let monitor = match JobObjectMonitor::from_child(&child) {
            Some(m) => m,
            None => return,
        };

        assert_eq!(monitor.tracking_method(), "process_tree");
        assert!(monitor.is_running());

        std::thread::sleep(std::time::Duration::from_millis(200));
        let is_running_after_parent_exit = monitor.is_running();
        assert!(is_running_after_parent_exit);

        let mut finished = false;
        for _ in 0..50 {
            if !monitor.is_running() {
                finished = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        assert!(finished);
    }
}

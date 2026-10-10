use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowAction {
    Close,
    Minimize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayDecision {
    HideToTray,
    PerformDefault,
}

pub fn evaluate_window_action(
    action: WindowAction,
    close_to_tray: bool,
    minimize_to_tray: bool,
    tray_available: bool,
) -> TrayDecision {
    if !tray_available {
        return TrayDecision::PerformDefault;
    }
    match action {
        WindowAction::Close => {
            if close_to_tray {
                TrayDecision::HideToTray
            } else {
                TrayDecision::PerformDefault
            }
        }
        WindowAction::Minimize => {
            if minimize_to_tray {
                TrayDecision::HideToTray
            } else {
                TrayDecision::PerformDefault
            }
        }
    }
}

pub fn setup_tray(
    app: &AppHandle,
    tray_available: Arc<AtomicBool>,
) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Show GameShelf", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let icon = match app.default_window_icon() {
        Some(i) => i.clone(),
        None => {
            let img = image::load_from_memory(include_bytes!("../icons/32x32.png"))?.to_rgba8();
            let (width, height) = img.dimensions();
            tauri::image::Image::new_owned(img.into_raw(), width, height)
        }
    };

    let _tray = TrayIconBuilder::with_id("gameshelf-tray")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            if event.id.as_ref() == "show" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            } else if event.id.as_ref() == "quit" {
                app.exit(0);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(visible) = window.is_visible() {
                        if visible {
                            let _ = window.hide();
                        } else {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        })
        .build(app)?;

    tray_available.store(true, Ordering::SeqCst);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tray_unavailable_always_performs_default() {
        assert_eq!(
            evaluate_window_action(WindowAction::Close, true, true, false),
            TrayDecision::PerformDefault
        );
        assert_eq!(
            evaluate_window_action(WindowAction::Minimize, true, true, false),
            TrayDecision::PerformDefault
        );
        assert_eq!(
            evaluate_window_action(WindowAction::Close, false, false, false),
            TrayDecision::PerformDefault
        );
    }

    #[test]
    fn test_close_to_tray_when_available() {
        assert_eq!(
            evaluate_window_action(WindowAction::Close, true, false, true),
            TrayDecision::HideToTray
        );
        assert_eq!(
            evaluate_window_action(WindowAction::Close, false, false, true),
            TrayDecision::PerformDefault
        );
    }

    #[test]
    fn test_minimize_to_tray_when_available() {
        assert_eq!(
            evaluate_window_action(WindowAction::Minimize, false, true, true),
            TrayDecision::HideToTray
        );
        assert_eq!(
            evaluate_window_action(WindowAction::Minimize, false, false, true),
            TrayDecision::PerformDefault
        );
    }
}

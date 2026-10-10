import React, { useEffect, useState } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { APP_CONFIG } from '../config/appConfig';
import { isTauri } from '../services/api';

export const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        appWindow.isMaximized().then(setIsMaximized);
        appWindow.onResized(() => {
          appWindow.isMaximized().then(setIsMaximized);
        }).then((fn) => {
          unlisten = fn;
        });
      });
    }
    return () => {
      unlisten?.();
    };
  }, []);

  const handleMinimize = async () => {
    if (isTauri()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      getCurrentWindow().minimize();
    }
  };

  const handleMaximize = async () => {
    if (isTauri()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      getCurrentWindow().toggleMaximize();
    } else {
      setIsMaximized(!isMaximized);
    }
  };

  const handleClose = async () => {
    if (isTauri()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      getCurrentWindow().close();
    }
  };

  return (
    <header
      data-tauri-drag-region
      className="h-9 w-full bg-surface border-b border-border flex items-center justify-between select-none px-3 z-50 flex-shrink-0"
    >
      <div data-tauri-drag-region className="flex items-center gap-2 h-full pointer-events-none">
        <img src={APP_CONFIG.logoPath} alt="GameShelf Logo" className="w-4 h-4 object-contain" />
        <span className="text-body font-semibold text-text tracking-normal">
          {APP_CONFIG.name}
        </span>
        <span className="text-xs text-muted/70 font-mono ml-0.5">
          v{APP_CONFIG.version}
        </span>
      </div>

      <div data-tauri-drag-region className="flex-1 h-full cursor-default" />

      <div className="flex items-center h-full -mr-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize window"
          className="h-9 w-10 inline-flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          title={isMaximized ? "Restore" : "Maximize"}
          aria-label={isMaximized ? "Restore window" : "Maximize window"}
          className="h-9 w-10 inline-flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          {isMaximized ? <Copy className="w-3.5 h-3.5 rotate-180" /> : <Square className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={handleClose}
          title="Close"
          aria-label="Close window"
          className="h-9 w-10 inline-flex items-center justify-center text-muted hover:text-white hover:bg-danger transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-danger"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};

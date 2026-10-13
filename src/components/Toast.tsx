import React from 'react';
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'error' | 'success' | 'info';
  title: string;
  message?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const isError = t.type === 'error';
        const isSuccess = t.type === 'success';

        return (
          <div
            key={t.id}
            className={`pointer-events-auto p-3 rounded-card border shadow-xl flex items-start gap-3 bg-surface transition-all animate-slide-in-bottom ${
              isError
                ? 'border-danger/50 text-danger'
                : isSuccess
                ? 'border-success/50 text-success'
                : 'border-border text-text'
            }`}
          >
            {isError && <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-danger" />}
            {isSuccess && <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-success" />}
            {!isError && !isSuccess && <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-accent" />}

            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-text">{t.title}</div>
              {t.message && <div className="text-xs text-muted mt-0.5 break-words">{t.message}</div>}
            </div>

            <button
              onClick={() => onDismiss(t.id)}
              className="text-muted hover:text-text p-0.5 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

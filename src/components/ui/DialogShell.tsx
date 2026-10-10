import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface DialogShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClassName?: string;
  zIndexClassName?: string;
  contentClassName?: string;
}

export const DialogShell: React.FC<DialogShellProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidthClassName = 'max-w-xl',
  zIndexClassName = 'z-50',
  contentClassName = '',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElement.current = document.activeElement as HTMLElement | null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const focusable = dialogRef.current.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          focusable.focus();
        } else {
          dialogRef.current.focus();
        }
      }
    }, 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
      if (previouslyFocusedElement.current && typeof previouslyFocusedElement.current.focus === 'function') {
        previouslyFocusedElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/70 flex items-center justify-center p-4 sm:p-6 ${zIndexClassName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-shell-title"
        aria-describedby={description ? 'dialog-shell-desc' : undefined}
        tabIndex={-1}
        className={`bg-surface border border-border rounded-dialog shadow-2xl flex flex-col w-full max-h-[88vh] overflow-hidden ${maxWidthClassName}`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0 bg-surface">
          <div>
            <h2 id="dialog-shell-title" className="text-sm font-semibold text-text tracking-normal">
              {title}
            </h2>
            {description && (
              <p id="dialog-shell-desc" className="text-xs text-muted mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-control text-muted hover:text-text hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className={`p-5 overflow-y-auto flex-1 min-h-0 text-body ${contentClassName}`}>
          {children}
        </div>

        {footer && (
          <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-border bg-surface-2/40 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

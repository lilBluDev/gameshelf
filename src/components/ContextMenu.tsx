import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { GameActionEntry, GameActionItem } from '../features/library/gameActions';

export interface ContextMenuProps {
  x: number;
  y: number;
  entries: GameActionEntry[];
  onClose: () => void;
  originElement?: HTMLElement | null;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  entries,
  onClose,
  originElement,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: y, left: x });
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const actionItems: GameActionItem[] = entries
    .filter((entry): entry is { type: 'item'; action: GameActionItem } => entry.type === 'item')
    .map((entry) => entry.action);

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const margin = 8;
    let nextLeft = x;
    let nextTop = y;

    if (nextLeft + rect.width > window.innerWidth - margin) {
      nextLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (nextTop + rect.height > window.innerHeight - margin) {
      nextTop = Math.max(margin, window.innerHeight - rect.height - margin);
    }

    setPosition({ top: nextTop, left: nextLeft });
  }, [x, y]);

  const handleClose = useCallback(() => {
    onClose();
    if (originElement && typeof originElement.focus === 'function') {
      originElement.focus();
    }
  }, [onClose, originElement]);

  useEffect(() => {
    const firstEnabled = actionItems.findIndex((item) => item.enabled);
    if (firstEnabled !== -1) {
      setFocusedIndex(firstEnabled);
    }
  }, [entries]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        handleClose();
      }
    }

    function handleScroll() {
      handleClose();
    }

    function handleResize() {
      handleClose();
    }

    function handleWindowBlur() {
      handleClose();
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [handleClose]);

  const moveFocus = useCallback(
    (direction: 1 | -1) => {
      if (actionItems.length === 0) return;
      let next = focusedIndex;
      for (let i = 0; i < actionItems.length; i++) {
        next = (next + direction + actionItems.length) % actionItems.length;
        if (actionItems[next].enabled) {
          setFocusedIndex(next);
          break;
        }
      }
    },
    [actionItems, focusedIndex]
  );

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      handleClose();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(-1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      const first = actionItems.findIndex((item) => item.enabled);
      if (first !== -1) setFocusedIndex(first);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      for (let i = actionItems.length - 1; i >= 0; i--) {
        if (actionItems[i].enabled) {
          setFocusedIndex(i);
          break;
        }
      }
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < actionItems.length) {
        const item = actionItems[focusedIndex];
        if (item.enabled) {
          handleClose();
          item.execute();
        }
      }
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const char = event.key.toLowerCase();
      let candidate = -1;
      for (let i = 1; i <= actionItems.length; i++) {
        const idx = (focusedIndex + i) % actionItems.length;
        const item = actionItems[idx];
        if (item.enabled && item.label.trim().toLowerCase().startsWith(char)) {
          candidate = idx;
          break;
        }
      }
      if (candidate !== -1) {
        event.preventDefault();
        setFocusedIndex(candidate);
      }
    }
  };

  let actionCounter = 0;

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 9999,
      }}
      className="min-w-[190px] py-1.5 rounded-card bg-surface-2 border border-border shadow-2xl text-text text-xs focus:outline-none select-none animate-scale-in"
    >
      {entries.map((entry) => {
        if (entry.type === 'separator') {
          return (
            <div
              key={entry.id}
              role="separator"
              className="my-1 border-t border-border/80"
            />
          );
        }

        const item = entry.action;
        const currentItemIndex = actionCounter;
        actionCounter++;
        const isFocused = currentItemIndex === focusedIndex;
        const Icon = item.icon;

        let itemColorClass = 'text-text hover:bg-surface';
        if (item.danger) {
          itemColorClass = 'text-danger hover:bg-danger/10';
        } else if (item.defaultAction) {
          itemColorClass = 'text-accent hover:bg-accent/10 font-medium';
        }

        if (isFocused) {
          if (item.danger) {
            itemColorClass = 'bg-danger/20 text-danger font-medium';
          } else if (item.defaultAction) {
            itemColorClass = 'bg-accent/20 text-accent font-semibold ring-1 ring-accent/40';
          } else {
            itemColorClass = 'bg-surface text-text ring-1 ring-border';
          }
        }

        return (
          <button
            key={item.id}
            role="menuitem"
            type="button"
            disabled={!item.enabled}
            aria-disabled={!item.enabled}
            aria-description={item.disabledReason}
            title={item.disabledReason}
            onClick={() => {
              if (item.enabled) {
                handleClose();
                item.execute();
              }
            }}
            onMouseEnter={() => {
              if (item.enabled) {
                setFocusedIndex(currentItemIndex);
              }
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${itemColorClass}`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

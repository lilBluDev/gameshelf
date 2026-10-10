import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  execute: () => void;
  enabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
  defaultAction?: boolean;
}

export type MenuEntry =
  | { type: 'item'; action: MenuItem }
  | { type: 'separator'; id: string };

export interface MenuProps {
  isOpen: boolean;
  onClose: () => void;
  entries: MenuEntry[];
  anchorRect?: DOMRect | null;
  position?: { x: number; y: number } | null;
  originElement?: HTMLElement | null;
}

export const Menu: React.FC<MenuProps> = ({
  isOpen,
  onClose,
  entries,
  anchorRect,
  position,
  originElement,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({
    top: position?.y ?? anchorRect?.bottom ?? 0,
    left: position?.x ?? anchorRect?.left ?? 0,
  });
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const actionItems = entries
    .filter((entry): entry is { type: 'item'; action: MenuItem } => entry.type === 'item')
    .map((entry) => entry.action);

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const margin = 8;

    let targetLeft = position ? position.x : anchorRect ? anchorRect.left : margin;
    let targetTop = position ? position.y : anchorRect ? anchorRect.bottom + 4 : margin;

    if (anchorRect && targetLeft + rect.width > window.innerWidth - margin) {
      targetLeft = Math.max(margin, anchorRect.right - rect.width);
    } else if (targetLeft + rect.width > window.innerWidth - margin) {
      targetLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    }

    if (anchorRect && targetTop + rect.height > window.innerHeight - margin) {
      targetTop = Math.max(margin, anchorRect.top - rect.height - 4);
    } else if (targetTop + rect.height > window.innerHeight - margin) {
      targetTop = Math.max(margin, window.innerHeight - rect.height - margin);
    }

    setCoords({ top: targetTop, left: targetLeft });
  }, [isOpen, anchorRect, position]);

  const handleClose = useCallback(() => {
    onClose();
    if (originElement && typeof originElement.focus === 'function') {
      originElement.focus();
    }
  }, [onClose, originElement]);

  useEffect(() => {
    if (!isOpen) return;
    const firstEnabled = actionItems.findIndex((item) => item.enabled !== false);
    if (firstEnabled !== -1) {
      setFocusedIndex(firstEnabled);
    }
  }, [isOpen, entries]);

  useEffect(() => {
    if (!isOpen) return;

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

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, handleClose]);

  const moveFocus = useCallback(
    (direction: 1 | -1) => {
      if (actionItems.length === 0) return;
      let next = focusedIndex;
      for (let i = 0; i < actionItems.length; i++) {
        next = (next + direction + actionItems.length) % actionItems.length;
        if (actionItems[next].enabled !== false) {
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
      const first = actionItems.findIndex((item) => item.enabled !== false);
      if (first !== -1) setFocusedIndex(first);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      for (let i = actionItems.length - 1; i >= 0; i--) {
        if (actionItems[i].enabled !== false) {
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
        if (item.enabled !== false) {
          handleClose();
          item.execute();
        }
      }
      return;
    }
  };

  if (!isOpen) return null;

  let itemCounter = 0;

  return (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        zIndex: 9999,
      }}
      className="min-w-[180px] py-1 rounded-card bg-surface-2 border border-border shadow-2xl text-text text-xs focus:outline-none select-none"
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
        const currentItemIndex = itemCounter++;
        const isFocused = currentItemIndex === focusedIndex;
        const Icon = item.icon;
        const isEnabled = item.enabled !== false;

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
            disabled={!isEnabled}
            aria-disabled={!isEnabled}
            aria-description={item.disabledReason}
            title={item.disabledReason}
            onClick={() => {
              if (isEnabled) {
                handleClose();
                item.execute();
              }
            }}
            onMouseEnter={() => {
              if (isEnabled) {
                setFocusedIndex(currentItemIndex);
              }
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${itemColorClass}`}
          >
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
            <span className="truncate flex-1">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

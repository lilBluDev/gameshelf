import React from 'react';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: React.ReactNode;
  title?: string;
  ariaLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (val: T) => void;
  options: SegmentedControlOption<T>[];
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className = '',
  ariaLabel,
}: SegmentedControlProps<T>) {
  const containerPadding = size === 'sm' ? 'p-0.5' : 'p-1';
  const itemHeight = size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-xs';

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = index;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % options.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + options.length) % options.length;
    }
    if (nextIndex !== index) {
      onChange(options[nextIndex].value);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center bg-surface-2/60 border border-border/80 rounded-control ${containerPadding} ${className}`}
    >
      {options.map((opt, idx) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={opt.ariaLabel}
            title={opt.title}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`inline-flex items-center justify-center font-medium rounded-[6px] transition-all select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${itemHeight} ${
              isSelected
                ? 'bg-surface text-text shadow-xs border border-border/60'
                : 'text-muted hover:text-text hover:bg-surface/40'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

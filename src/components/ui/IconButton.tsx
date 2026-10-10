import React, { forwardRef } from 'react';

export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'ghost' | 'secondary' | 'danger';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  'aria-label': string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', variant = 'ghost', className = '', children, disabled, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-control transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed';

    const sizeStyles = {
      sm: 'w-7 h-7 text-xs',
      md: 'w-8 h-8 text-sm',
      lg: 'w-9 h-9 text-base',
    }[size];

    const variantStyles = {
      ghost: 'text-muted hover:text-text hover:bg-surface-2',
      secondary: 'bg-surface-2 text-text border border-border hover:bg-surface-2/80',
      danger: 'text-muted hover:text-danger hover:bg-danger/10',
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';

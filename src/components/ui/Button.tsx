import React, { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon, className = '', children, disabled, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-control transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none gap-2';

    const sizeStyles = {
      sm: 'h-7 px-2.5 text-xs',
      md: 'h-8 px-3 text-body',
      lg: 'h-9 px-4 text-sm',
    }[size];

    const variantStyles = {
      primary: 'bg-accent text-white hover:bg-accent-hover shadow-sm',
      secondary:
        'bg-surface-2 text-text border border-border hover:bg-surface-2/80 hover:border-muted/40',
      ghost: 'bg-transparent text-muted hover:text-text hover:bg-surface-2',
      danger:
        'bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 hover:border-danger/40',
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
        {...props}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

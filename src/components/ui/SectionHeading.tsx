import React from 'react';

export interface SectionHeadingProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const SectionHeading: React.FC<SectionHeadingProps> = ({
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`flex items-start justify-between gap-4 mb-3 ${className}`}>
      <div>
        <h3 className="text-body font-semibold text-text tracking-normal">{title}</h3>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
};

import React from 'react';
import { AlertCircle, CheckCircle2, Play, Flame, Monitor, Cpu, CornerUpRight, Gamepad2 } from 'lucide-react';
import { GameStatus, SourceKind } from '../../types/models';

export interface StatusLabelProps {
  status?: GameStatus | 'Running';
  source?: SourceKind;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusLabel: React.FC<StatusLabelProps> = ({
  status,
  source,
  size = 'sm',
  className = '',
}) => {
  const textSize = size === 'sm' ? 'text-xs' : 'text-body';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  if (status === 'Running') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium text-accent ${textSize} ${className}`}
      >
        <Play className={`${iconSize} fill-accent animate-pulse`} />
        <span>Running</span>
      </span>
    );
  }

  if (status === 'Missing') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium text-warning ${textSize} ${className}`}
      >
        <AlertCircle className={iconSize} />
        <span>Missing</span>
      </span>
    );
  }

  if (status === 'Installed') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-medium text-muted ${textSize} ${className}`}
      >
        <CheckCircle2 className={`${iconSize} text-success/80`} />
        <span>Installed</span>
      </span>
    );
  }

  if (source) {
    const icon = {
      Steam: <Flame className={iconSize} />,
      Standalone: <Monitor className={iconSize} />,
      Emulated: <Cpu className={iconSize} />,
      Shortcut: <CornerUpRight className={iconSize} />,
      Manual: <Gamepad2 className={iconSize} />,
    }[source];

    return (
      <span
        className={`inline-flex items-center gap-1.5 text-muted ${textSize} ${className}`}
      >
        {icon}
        <span>{source}</span>
      </span>
    );
  }

  return null;
};

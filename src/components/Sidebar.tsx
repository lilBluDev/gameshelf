import React from 'react';
import {
  Gamepad2,
  Heart,
  Clock,
  Flame,
  Monitor,
  Cpu,
  Settings as SettingsIcon,
} from 'lucide-react';

export type NavFilter = 'all' | 'favorites' | 'recent' | 'steam' | 'pc' | 'emulated';

export interface SidebarCounts {
  all?: number;
  favorites?: number;
  recent?: number;
  steam?: number;
  pc?: number;
  emulated?: number;
}

interface NavItem {
  id: NavFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  count?: number;
  reason?: string;
}

interface SidebarProps {
  activeFilter: NavFilter;
  onSelectFilter: (filter: NavFilter) => void;
  onOpenSettings: () => void;
  counts?: SidebarCounts;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeFilter,
  onSelectFilter,
  onOpenSettings,
  counts,
}) => {
  const mainNavItems: NavItem[] = [
    {
      id: 'all',
      label: 'Library',
      icon: Gamepad2,
      enabled: true,
      count: counts?.all,
    },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: Heart,
      enabled: true,
      count: counts?.favorites,
    },
    {
      id: 'recent',
      label: 'Recently Played',
      icon: Clock,
      enabled: true,
      count: counts?.recent,
    },
  ];

  const sourceNavItems: NavItem[] = [
    {
      id: 'steam',
      label: 'Steam Games',
      icon: Flame,
      enabled: true,
      count: counts?.steam,
    },
    {
      id: 'pc',
      label: 'PC Games',
      icon: Monitor,
      enabled: true,
      count: counts?.pc,
    },
    {
      id: 'emulated',
      label: 'Emulated',
      icon: Cpu,
      enabled: true,
      count: counts?.emulated,
    },
  ];

  return (
    <aside className="w-[208px] min-w-[180px] max-w-[208px] bg-surface border-r border-border flex flex-col justify-between select-none flex-shrink-0">
      <div className="p-2.5 space-y-5">
        <div>
          <div className="px-2.5 mb-1.5 text-xs font-medium text-muted">
            Browse
          </div>
          <nav className="space-y-0.5">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeFilter === item.id;
              if (!item.enabled) {
                return (
                  <div
                    key={item.id}
                    title={item.reason}
                    className="flex items-center justify-between px-2.5 h-9 rounded-control text-muted/50 cursor-not-allowed text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>
                    <span className="text-xs text-muted/60">
                      Later
                    </span>
                  </div>
                );
              }
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectFilter(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center justify-between px-2.5 h-9 rounded-control text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    isActive
                      ? 'bg-surface-2 text-text font-medium relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-accent'
                      : 'text-muted hover:text-text hover:bg-surface-2/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="text-xs font-mono text-muted tabular-nums">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div>
          <div className="px-2.5 mb-1.5 text-xs font-medium text-muted">
            Platforms
          </div>
          <nav className="space-y-0.5">
            {sourceNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeFilter === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectFilter(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center justify-between px-2.5 h-9 rounded-control text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    isActive
                      ? 'bg-surface-2 text-text font-medium relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-accent'
                      : 'text-muted hover:text-text hover:bg-surface-2/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.count !== undefined && item.count > 0 && (
                    <span className="text-xs font-mono text-muted tabular-nums">
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="p-2.5 border-t border-border space-y-1">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-control text-xs font-medium text-muted hover:text-text hover:bg-surface-2/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <SettingsIcon className="w-4 h-4" />
          <span>Settings</span>
        </button>

        <div className="px-2.5 py-1 text-xs text-muted flex items-center justify-between">
          <span>Local Library</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-success" title="Local-first database connected" />
        </div>
      </div>
    </aside>
  );
};

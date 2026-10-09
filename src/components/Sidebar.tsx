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

export type NavFilter = 'all' | 'favorites' | 'steam' | 'pc' | 'emulated';

export interface SidebarCounts {
  all?: number;
  favorites?: number;
  steam?: number;
  pc?: number;
  emulated?: number;
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
  const mainNavItems = [
    {
      id: 'all' as NavFilter,
      label: 'Library',
      icon: Gamepad2,
      enabled: true,
      count: counts?.all,
    },
    {
      id: 'favorites' as NavFilter,
      label: 'Favorites',
      icon: Heart,
      enabled: true,
      count: counts?.favorites,
    },
    {
      id: 'recent',
      label: 'Recently Played',
      icon: Clock,
      enabled: false,
      reason: 'Not available yet (Playtime tracking out of scope)',
      count: undefined,
    },
  ];

  const sourceNavItems = [
    {
      id: 'steam' as NavFilter,
      label: 'Steam Games',
      icon: Flame,
      enabled: true,
      count: counts?.steam,
    },
    {
      id: 'pc' as NavFilter,
      label: 'PC Games',
      icon: Monitor,
      enabled: true,
      count: counts?.pc,
    },
    {
      id: 'emulated' as NavFilter,
      label: 'Emulated',
      icon: Cpu,
      enabled: true,
      count: counts?.emulated,
    },
  ];

  return (
    <aside className="w-56 bg-surface border-r border-border flex flex-col justify-between select-none flex-shrink-0">
      <div className="p-3 space-y-6">
        {/* Main Section */}
        <div>
          <div className="px-2.5 mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
            Browse
          </div>
          <nav className="space-y-1">
            {mainNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeFilter === item.id;
              if (!item.enabled) {
                return (
                  <div
                    key={item.id}
                    title={item.reason}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-control text-muted opacity-50 cursor-not-allowed group text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </div>
                    <span className="text-[10px] bg-surface-2 px-1.5 py-0.5 rounded text-muted border border-border">
                      Later
                    </span>
                  </div>
                );
              }
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectFilter(item.id as NavFilter)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-control text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-text hover:bg-surface-2 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.count !== undefined && item.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-surface-2 text-muted border border-border'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Platforms Section */}
        <div>
          <div className="px-2.5 mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
            Platforms
          </div>
          <nav className="space-y-1">
            {sourceNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeFilter === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectFilter(item.id as NavFilter)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-control text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-text hover:bg-surface-2 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.count !== undefined && item.count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-surface-2 text-muted border border-border'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer / Settings Section */}
      <div className="p-3 border-t border-border space-y-1">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-control text-xs font-medium text-text hover:bg-surface-2 hover:text-white transition-colors"
        >
          <SettingsIcon className="w-4 h-4 text-muted" />
          <span>Settings</span>
        </button>

        <div className="px-2.5 py-1 text-[10px] text-muted flex items-center justify-between">
          <span>Local Library</span>
          <span className="inline-block w-2 h-2 rounded-full bg-success" title="Local-first database connected" />
        </div>
      </div>
    </aside>
  );
};

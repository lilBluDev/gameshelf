import { Game } from './models';

export interface AppInfo {
  name: string;
  version: string;
  bundle_id: string;
  os: string;
  data_dir: string;
  log_dir: string;
  db_version: number;
}

export type ThemeMode = 'dark' | 'light' | 'system';
export type ViewMode = 'grid' | 'list';
export type CardSize = 'small' | 'medium' | 'large';

export interface AppSettings {
  theme: ThemeMode;
  default_view_mode: ViewMode;
  grid_card_size: CardSize;
  steam_grid_db_configured: boolean;
  close_to_tray: boolean;
}

export interface SetSettingPayload {
  key: string;
  value: string;
}

export interface CommandError {
  code: string;
  message: string;
  details?: string;
}

export interface ListGamesQuery {
  filter?: 'all' | 'favorites' | 'steam' | 'pc' | 'emulated';
  search?: string;
  sort_by?: 'title' | 'release_year' | 'status';
  sort_order?: 'asc' | 'desc';
}

export interface ListGamesResponse {
  games: Game[];
  total: number;
}

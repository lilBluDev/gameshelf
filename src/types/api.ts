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

export type SortField = 'title' | 'release_year' | 'status' | 'recently_added' | 'recently_played';

export interface ListGamesQuery {
  filter?: 'all' | 'favorites' | 'steam' | 'pc' | 'emulated';
  search?: string;
  sort_by?: SortField;
  sort_order?: 'asc' | 'desc';
  include_hidden?: boolean;
}

export interface ListGamesResponse {
  games: Game[];
  total: number;
}

export interface AddManualGamePayload {
  title: string;
  executable_path: string;
  args?: string[];
  working_dir?: string;
  is_shortcut: boolean;
}

export interface UpdateGamePayload {
  id: string;
  title?: string;
  notes?: string;
  user_tags?: string[];
  is_favorite?: boolean;
  is_hidden?: boolean;
}

export interface UpdateLaunchSettingsPayload {
  id: string;
  executable_path: string;
  args: string[];
  working_dir?: string;
}

export interface InspectFileResponse {
  title: string;
  executable_path: string;
  working_dir?: string | null;
  args: string[];
  is_shortcut: boolean;
  exists: boolean;
  normalized_path: string;
}

export interface DuplicateCheckResponse {
  is_duplicate: boolean;
  existing_game: Game | null;
}

export interface LaunchResult {
  success: boolean;
  pid: number | null;
  message: string;
}

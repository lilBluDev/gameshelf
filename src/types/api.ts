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

export interface SteamLibraryFolder {
  path: string;
  normalized_path: string;
  label: string | null;
  is_accessible: boolean;
  is_enabled: boolean;
  game_count: number;
}

export interface SteamFilterRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface SteamFilterConfig {
  rules: SteamFilterRule[];
  explicit_included_app_ids: number[];
  explicit_excluded_app_ids: number[];
}

export interface SkippedSteamApp {
  app_id: number;
  name: string;
  library_path: string;
  reason: string;
}

export interface SteamScanResult {
  steam_path: string | null;
  libraries: SteamLibraryFolder[];
  imported_games: Game[];
  skipped_apps: SkippedSteamApp[];
  warnings: string[];
}

export interface SteamStatusResponse {
  is_installed: boolean;
  steam_path: string | null;
  libraries: SteamLibraryFolder[];
  filter_config: SteamFilterConfig;
  last_scanned_at: string | null;
  total_imported_games: number;
  warnings: string[];
}

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface ScanCandidate {
  id: string;
  title: string;
  executable_path: string;
  working_dir: string;
  args: string[];
  confidence: ConfidenceLevel;
  reason: string;
  file_size_bytes: number;
  is_skipped: boolean;
  skip_reason: string | null;
  selected: boolean;
  existing_game_id: string | null;
}

export interface ScanProgress {
  current_directory: string;
  folders_scanned: number;
  files_examined: number;
  candidates_found: number;
  skipped_count: number;
  errors_count: number;
  is_complete: boolean;
  is_cancelled: boolean;
}

export interface ScanResult {
  candidates: ScanCandidate[];
  folders_scanned: number;
  files_examined: number;
  skipped_count: number;
  errors: string[];
  is_cancelled: boolean;
}

export interface ScanOptions {
  root_paths: string[];
  max_depth: number;
  custom_exclusions: string[];
  show_skipped: boolean;
}

export interface ScanSource {
  id: string;
  path: string;
  normalized_path: string;
  depth: number;
  last_scanned_at: string | null;
  game_count: number;
  created_at: string;
  updated_at: string;
}


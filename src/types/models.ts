export type SourceKind = 'Steam' | 'Standalone' | 'Shortcut' | 'Emulated' | 'Manual';

export type GameStatus = 'Installed' | 'Missing' | 'Unknown';

export type LaunchAction =
  | { type: 'Executable'; path: string; args: string[]; working_dir?: string | null; env?: Record<string, string> }
  | { type: 'Steam'; app_id: number }
  | { type: 'Shortcut'; target: string; args: string[]; working_dir?: string | null }
  | { type: 'EmulatedGame'; profile_id: string; rom_path: string; arg_overrides?: string[] }
  | { type: 'Unavailable'; reason: string };

export type ArtworkRole = 'cover' | 'hero' | 'logo' | 'icon' | 'background';

export interface ArtworkAsset {
  id: string;
  game_id: string;
  role: ArtworkRole;
  provider: string;
  provider_asset_id?: string | null;
  source_url?: string | null;
  cached_path?: string | null;
  width?: number | null;
  height?: number | null;
  mime_type?: string | null;
  attribution?: string | null;
  is_selected: boolean;
}

export interface Game {
  id: string;
  title: string;
  sort_title: string;
  description?: string | null;
  developer?: string | null;
  publisher?: string | null;
  release_year?: number | null;
  genres: string[];
  tags: string[];
  source_kind: SourceKind;
  source_id?: string | null;
  install_dir?: string | null;
  launch_action: LaunchAction;
  status: GameStatus;
  last_scanned_at?: string | null;
  is_favorite: boolean;
  is_hidden: boolean;
  notes?: string | null;
  user_tags: string[];
  match_confidence?: number | null;
  provider_attribution?: string | null;
  last_launched_at?: string | null;
  normalized_path?: string | null;
  created_at?: string;
  artwork?: Partial<Record<ArtworkRole, ArtworkAsset>>;
}

export type WorkingDirRule = 'EmulatorDir' | 'RomDir' | { Custom: string };

export type EmulatorValidationStatus =
  | { status: 'Verified'; detail?: never }
  | { status: 'ExecutableMissing'; detail?: never }
  | { status: 'NeedsConfiguration'; detail: string }
  | { status: 'InvalidTemplate'; detail: string };

export interface RegistryHint {
  hive: string;
  path: string;
  key: string;
}

export interface DetectionHints {
  known_paths: string[];
  registry_keys: RegistryHint[];
  shortcut_names: string[];
  executable_names: string[];
}

export interface EmulatorProfile {
  id: string;
  name: string;
  systems: string[];
  supported_extensions: string[];
  argument_template: string[];
  working_dir_rule: WorkingDirRule;
  executable_path: string | null;
  core_path: string | null;
  is_builtin: boolean;
  detection_hints: DetectionHints;
  verification_source: string | null;
  validation_status: EmulatorValidationStatus;
}

export interface ScanJob {
  id: string;
  root_path: string;
  options: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  candidates_count: number;
  imported_count: number;
  skipped_count: number;
  error_count: number;
  is_cancellable: boolean;
  errors_summary?: string | null;
}

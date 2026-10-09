/**
 * Formats a duration in seconds into a clean, human-readable playtime badge.
 * Examples:
 * - 0 => '0m'
 * - 45 => '< 1m'
 * - 120 => '2m'
 * - 3600 => '1h'
 * - 4500 => '1h 15m'
 */
export function formatPlaytime(seconds: number): string {
  if (!seconds || seconds <= 0) {
    return '0m';
  }
  if (seconds < 60) {
    return '< 1m';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}

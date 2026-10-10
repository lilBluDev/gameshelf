export function formatPlaytime(seconds: number): string {
  if (!seconds || seconds <= 0) {
    return '0m';
  }
  if (seconds < 60) {
    return '<1m';
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

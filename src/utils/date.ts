export function formatUtc(iso?: string): string {
  if (!iso) return 'n/a';
  return new Date(iso).toLocaleString();
}

export function formatRelativeFromNow(iso?: string): string {
  if (!iso) return 'n/a';
  const deltaMs = Date.now() - Date.parse(iso);
  if (!Number.isFinite(deltaMs)) return 'n/a';
  const seconds = Math.max(0, Math.floor(deltaMs / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function secondsUntil(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000));
}

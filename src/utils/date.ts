export function formatUtc(iso?: string): string {
  if (!iso) return 'n/a';
  return new Date(iso).toLocaleString();
}

export function secondsUntil(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000));
}

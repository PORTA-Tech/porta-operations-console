export function shortHash(value?: string): string {
  if (!value) return 'n/a';
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

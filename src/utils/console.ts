export function formatSeconds(s: number | null | undefined): string {
  if (!s || s <= 0) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const diff = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(diff) || diff < 0) return 'just now';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function pressureColor(level: number | null | undefined): string {
  if (!level) return 'var(--green)';
  if (level > 0.6) return 'var(--red)';
  if (level > 0.3) return 'var(--amber)';
  return 'var(--green)';
}

export function attentionStateClass(kind?: string | null, agentRunning?: boolean): string {
  if (!agentRunning) return 'state-offline';
  switch (kind) {
    case 'focus': return 'state-focused';
    case 'away': return 'state-away';
    case 'context_excursion': return 'state-away';
    case 'off_task_distraction': return 'state-distracted';
    case 'fragmentation_distraction': return 'state-distracted';
    default: return 'state-offline';
  }
}

export function attentionStateLabel(kind?: string | null, agentRunning?: boolean): string {
  if (!agentRunning) return 'OFFLINE';
  switch (kind) {
    case 'focus': return 'FOCUSED';
    case 'away': return 'AWAY';
    case 'context_excursion': return 'CONTEXT SWITCH';
    case 'off_task_distraction': return 'DISTRACTED';
    case 'fragmentation_distraction': return 'FRAGMENTED';
    default: return 'OFFLINE';
  }
}

export function getDayLabels(): string[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return i === 6 ? 'Today' : days[d.getDay()];
  });
}

export function getLastSevenDayStrings(): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

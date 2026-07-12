import { useMemo, useState } from 'react';
import { useCategoriesFeed } from '../../hooks/useCategoriesFeed';
import {
  APP_CATEGORY_NAMES,
  setCategoryOverride,
  type AppCategoryLabel,
  type AppCategoryName,
  type AppCategorySource
} from '../../api/categories';
import { relativeTime } from '../../utils/console';

const NON_WORK: AppCategoryName[] = ['Entertainment', 'SocialMedia', 'Gaming'];
const WORK: AppCategoryName[] = ['Development', 'Productivity'];

function categoryTagClass(category: AppCategoryName): string {
  if (WORK.includes(category)) return 'tag-green';
  if (NON_WORK.includes(category)) return 'tag-amber';
  if (category === 'Communication') return 'tag-blue';
  if (category === 'GamingLauncher') return 'tag-amber';
  return 'tag-accent'; // Unknown
}

function sourceTagClass(source: AppCategorySource): string {
  switch (source) {
    case 'override':
      return 'tag-green';
    case 'llm':
      return 'tag-accent';
    case 'curated':
      return 'tag-blue';
    default:
      return 'tag-amber'; // pending
  }
}

function sourceLabel(source: AppCategorySource): string {
  switch (source) {
    case 'override':
      return 'Override';
    case 'llm':
      return 'Haiku';
    case 'curated':
      return 'Curated';
    default:
      return 'Pending';
  }
}

type SourceFilter = 'all' | AppCategorySource;

export function CategoriesPage() {
  const { rows, loading, error, refresh } = useCategoriesFeed();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [savingToken, setSavingToken] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);

  const total = rows.length;
  const llmCount = rows.filter((r) => r.source === 'llm').length;
  const overrideCount = rows.filter((r) => r.source === 'override').length;
  const pendingCount = rows.filter((r) => r.source === 'pending' || r.category === 'Unknown').length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
      if (q.length > 0 && !r.token.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, sourceFilter]);

  async function handleOverride(row: AppCategoryLabel, next: AppCategoryName): Promise<void> {
    if (next === row.category) return;
    setSavingToken(row.token);
    setSaveError(undefined);
    try {
      await setCategoryOverride(row.token, next);
      await refresh();
    } catch {
      setSaveError(`Could not override "${row.token}". Try again.`);
    } finally {
      setSavingToken(undefined);
    }
  }

  return (
    <>
      <div className="fleet-strip">
        <div className="fleet-card c-accent">
          <div className="fc-label">Known Tokens</div>
          <div className="fc-val accent">{total}</div>
          <div className="fc-sub">Apps &amp; sites categorized</div>
        </div>
        <div className="fleet-card c-blue">
          <div className="fc-label">Resolved by Haiku</div>
          <div className="fc-val blue">{llmCount}</div>
          <div className="fc-sub">LLM-classified tokens</div>
        </div>
        <div className="fleet-card c-green">
          <div className="fc-label">Operator Overrides</div>
          <div className="fc-val green">{overrideCount}</div>
          <div className="fc-sub">Manually corrected</div>
        </div>
        <div className="fleet-card c-amber">
          <div className="fc-label">Pending / Unknown</div>
          <div className="fc-val amber">{pendingCount}</div>
          <div className="fc-sub">Awaiting or unresolved</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">App Categories</div>
            <div className="card-sub">
              How the fleet classifies each app / site. Correct any wrong call — your override always wins.
            </div>
          </div>
          <span className="card-tag tag-accent">2d</span>
        </div>

        <div className="card-body">
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search token…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: '1 1 220px',
                minWidth: 180,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg2)',
                color: 'var(--text)',
                fontSize: 13
              }}
            />
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg2)',
                color: 'var(--text)',
                fontSize: 13
              }}
            >
              <option value="all">All sources</option>
              <option value="llm">Haiku</option>
              <option value="curated">Curated</option>
              <option value="override">Override</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          {saveError && (
            <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 10 }}>{saveError}</div>
          )}

          {loading && rows.length === 0 ? (
            <div className="empty-state">
              <p>Loading categories…</p>
            </div>
          ) : error ? (
            <div className="empty-state">
              <p>Couldn&apos;t load categories: {error.message}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <p>
                {total === 0
                  ? 'No categorized tokens yet. As agents on 1.2.109+ report unknown apps, Haiku classifies them and they appear here.'
                  : 'No tokens match this filter.'}
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Category</th>
                  <th>Source</th>
                  <th>Model</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.token}>
                    <td style={{ fontWeight: 600 }}>{row.token}</td>
                    <td>
                      <span className={`card-tag ${categoryTagClass(row.category)}`} style={{ marginRight: 8 }}>
                        {row.category}
                      </span>
                      <select
                        value={row.category}
                        disabled={savingToken === row.token}
                        onChange={(e) => void handleOverride(row, e.target.value as AppCategoryName)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          background: 'var(--bg2)',
                          color: 'var(--muted)',
                          fontSize: 12
                        }}
                      >
                        {APP_CATEGORY_NAMES.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`card-tag ${sourceTagClass(row.source)}`}>{sourceLabel(row.source)}</span>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{row.modelVer ?? '—'}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{relativeTime(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

import type { CohortSummary } from '../../api/cohorts';

interface CohortTrendLinesProps {
  primary?: CohortSummary;
  secondary?: CohortSummary;
  compareMode: boolean;
}

function polylinePoints(values: number[]): string {
  if (values.length === 0) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * 100;
      const y = 90 - ((value - min) / range) * 80;
      return `${x},${y}`;
    })
    .join(' ');
}

export function CohortTrendLines({ primary, secondary, compareMode }: CohortTrendLinesProps) {
  const primarySeries = primary?.trend.map((point) => point.errorRatePct) ?? [];
  const secondarySeries = compareMode ? secondary?.trend.map((point) => point.errorRatePct) ?? [] : [];

  return (
    <svg viewBox="0 0 100 100" className="trend-svg" role="img" aria-label="Cohort error-rate trend lines">
      <rect x="0" y="0" width="100" height="100" fill="none" />
      <polyline className="trend-line-primary" fill="none" strokeWidth="2.5" points={polylinePoints(primarySeries)} />
      {compareMode && secondarySeries.length > 0 ? (
        <polyline className="trend-line-secondary" fill="none" strokeWidth="2.5" points={polylinePoints(secondarySeries)} />
      ) : null}
    </svg>
  );
}

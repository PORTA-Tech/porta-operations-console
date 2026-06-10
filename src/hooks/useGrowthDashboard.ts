import { useEffect, useState } from 'react';
import {
  fetchGrowthCohorts,
  fetchGrowthSeries,
  fetchGrowthSummary,
  fetchGrowthUserJourney,
  type GrowthCohorts,
  type GrowthSeries,
  type ConsoleSeriesMetric,
  type GrowthSummary,
  type GrowthUserJourney
} from '../api/growth';
import { toApiError, type ApiError } from '../api/client';

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_REFRESH_INTERVAL_MS = 30_000;
const DEFAULT_COHORT_LIMIT = 10;

function buildTrailingWindow(windowDays: number): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  from.setUTCDate(from.getUTCDate() - (windowDays - 1));
  return {
    from: from.toISOString(),
    to: now.toISOString()
  };
}

async function fetchDashboardBundle(windowDays: number): Promise<{
  summary: GrowthSummary;
  seriesByMetric: Partial<Record<ConsoleSeriesMetric, GrowthSeries>>;
  cohorts: GrowthCohorts;
}> {
  const range = buildTrailingWindow(windowDays);
  const [summary, registrations, activations, activeUsers, installs, cohorts] = await Promise.all([
    fetchGrowthSummary(windowDays),
    fetchGrowthSeries({
      metric: 'registrations',
      interval: 'day',
      from: range.from,
      to: range.to
    }),
    fetchGrowthSeries({
      metric: 'activations',
      interval: 'day',
      from: range.from,
      to: range.to
    }),
    fetchGrowthSeries({
      metric: 'active_users',
      interval: 'day',
      from: range.from,
      to: range.to
    }),
    fetchGrowthSeries({
      metric: 'installs',
      interval: 'day',
      from: range.from,
      to: range.to
    }).catch(() => undefined),
    fetchGrowthCohorts({ limit: DEFAULT_COHORT_LIMIT })
  ]);

  return {
    summary,
    seriesByMetric: {
      registrations,
      activations,
      active_users: activeUsers,
      ...(installs ? { installs } : {})
    },
    cohorts
  };
}

export interface GrowthDashboardState {
  loading: boolean;
  refreshing: boolean;
  error: ApiError | undefined;
  summary: GrowthSummary | null;
  seriesByMetric: Partial<Record<ConsoleSeriesMetric, GrowthSeries>>;
  cohorts: GrowthCohorts | null;
  lastRefreshUtc: string | null;
  journey: GrowthUserJourney | null;
  journeyLoading: boolean;
  journeyError: ApiError | undefined;
  loadJourney: (accountId: string) => Promise<void>;
  clearJourney: () => void;
  refresh: () => Promise<void>;
}

export function useGrowthDashboard(): GrowthDashboardState {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | undefined>();
  const [summary, setSummary] = useState<GrowthSummary | null>(null);
  const [seriesByMetric, setSeriesByMetric] = useState<Partial<Record<ConsoleSeriesMetric, GrowthSeries>>>({});
  const [cohorts, setCohorts] = useState<GrowthCohorts | null>(null);
  const [lastRefreshUtc, setLastRefreshUtc] = useState<string | null>(null);
  const [journey, setJourney] = useState<GrowthUserJourney | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyError, setJourneyError] = useState<ApiError | undefined>();

  useEffect(() => {
    let active = true;

    const refresh = async (initial: boolean): Promise<void> => {
      if (initial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const bundle = await fetchDashboardBundle(DEFAULT_WINDOW_DAYS);
        if (!active) {
          return;
        }

        setSummary(bundle.summary);
        setSeriesByMetric(bundle.seriesByMetric);
        setCohorts(bundle.cohorts);
        setLastRefreshUtc(bundle.summary.generatedAtUtc);
        setError(undefined);
      } catch (nextError) {
        if (!active) {
          return;
        }
        setError(toApiError(nextError));
      } finally {
        if (!active) {
          return;
        }
        setLoading(false);
        setRefreshing(false);
      }
    };

    void refresh(true);
    const timer = window.setInterval(() => {
      void refresh(false);
    }, DEFAULT_REFRESH_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      const bundle = await fetchDashboardBundle(DEFAULT_WINDOW_DAYS);
      setSummary(bundle.summary);
      setSeriesByMetric(bundle.seriesByMetric);
      setCohorts(bundle.cohorts);
      setLastRefreshUtc(bundle.summary.generatedAtUtc);
      setError(undefined);
    } catch (nextError) {
      setError(toApiError(nextError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function loadJourney(accountId: string): Promise<void> {
    const trimmed = accountId.trim();
    if (trimmed.length === 0) {
      setJourney(null);
      setJourneyError(undefined);
      return;
    }

    setJourneyLoading(true);
    try {
      const nextJourney = await fetchGrowthUserJourney(trimmed);
      setJourney(nextJourney);
      setJourneyError(undefined);
    } catch (nextError) {
      setJourney(null);
      setJourneyError(toApiError(nextError));
    } finally {
      setJourneyLoading(false);
    }
  }

  function clearJourney(): void {
    setJourney(null);
    setJourneyError(undefined);
  }

  return {
    loading,
    refreshing,
    error,
    summary,
    seriesByMetric,
    cohorts,
    lastRefreshUtc,
    journey,
    journeyLoading,
    journeyError,
    loadJourney,
    clearJourney,
    refresh
  };
}

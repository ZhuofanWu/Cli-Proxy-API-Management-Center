import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  usageApi,
  type UsageChartGranularity,
  type UsageMetricTrendPayload,
} from '@/services/api/usage';
import { type UsageTimeRange } from '@/utils/usage';

type UsageTrendMetric = 'requests' | 'tokens';

export interface UseUsageMetricTrendDataReturn {
  trend: UsageMetricTrendPayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  loadUsageMetricTrend: () => Promise<void>;
}

const getErrorMessage = (value: unknown) => (value instanceof Error ? value.message : '');

export function useUsageMetricTrendData(
  metric: UsageTrendMetric,
  granularity: UsageChartGranularity,
  timeRange: UsageTimeRange,
  models: string[],
  enabled: boolean
): UseUsageMetricTrendDataReturn {
  const { t } = useTranslation();
  const [trend, setTrend] = useState<UsageMetricTrendPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loadUsageMetricTrend = useCallback(async () => {
    if (!enabled) {
      setTrend(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    setLoading(true);
    try {
      const response =
        metric === 'tokens'
          ? await usageApi.getUsageTokenTrend(granularity, timeRange, models)
          : await usageApi.getUsageRequestTrend(granularity, timeRange, models);
      setTrend(response ?? null);
      setError('');
      setLastRefreshedAt(new Date());
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('usage_stats.loading_error');
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [enabled, granularity, metric, models, t, timeRange]);

  useEffect(() => {
    if (!enabled) {
      setTrend(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    void loadUsageMetricTrend().catch(() => {});
  }, [enabled, loadUsageMetricTrend]);

  return {
    trend,
    loading,
    error,
    lastRefreshedAt,
    loadUsageMetricTrend,
  };
}

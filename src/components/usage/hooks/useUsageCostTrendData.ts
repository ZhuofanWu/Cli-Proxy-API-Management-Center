import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  usageApi,
  type UsageCostTrendGranularity,
  type UsageCostTrendPayload,
} from '@/services/api/usage';
import { type UsageTimeRange } from '@/utils/usage';

export interface UseUsageCostTrendDataReturn {
  costTrend: UsageCostTrendPayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  loadUsageCostTrend: () => Promise<void>;
}

const getErrorMessage = (value: unknown) => (value instanceof Error ? value.message : '');

export function useUsageCostTrendData(
  period: UsageCostTrendGranularity,
  timeRange: UsageTimeRange,
  offset: number,
  enabled: boolean
): UseUsageCostTrendDataReturn {
  const { t } = useTranslation();
  const [costTrend, setCostTrend] = useState<UsageCostTrendPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loadUsageCostTrend = useCallback(async () => {
    if (!enabled) {
      setCostTrend(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    setLoading(true);
    try {
      const response = await usageApi.getUsageCostTrend(period, timeRange, offset);
      setCostTrend(response ?? null);
      setError('');
      setLastRefreshedAt(new Date());
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('usage_stats.loading_error');
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [enabled, offset, period, t, timeRange]);

  useEffect(() => {
    if (!enabled) {
      setCostTrend(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    void loadUsageCostTrend().catch(() => {});
  }, [enabled, loadUsageCostTrend]);

  return {
    costTrend,
    loading,
    error,
    lastRefreshedAt,
    loadUsageCostTrend,
  };
}

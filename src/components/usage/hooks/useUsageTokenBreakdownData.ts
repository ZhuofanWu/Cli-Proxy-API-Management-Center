import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  usageApi,
  type UsageTokenBreakdownGranularity,
  type UsageTokenBreakdownPayload,
} from '@/services/api/usage';
import { type UsageTimeRange } from '@/utils/usage';

export interface UseUsageTokenBreakdownDataReturn {
  tokenBreakdown: UsageTokenBreakdownPayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  loadUsageTokenBreakdown: () => Promise<void>;
}

const getErrorMessage = (value: unknown) => (value instanceof Error ? value.message : '');

export function useUsageTokenBreakdownData(
  period: UsageTokenBreakdownGranularity,
  timeRange: UsageTimeRange,
  offset: number,
  enabled: boolean
): UseUsageTokenBreakdownDataReturn {
  const { t } = useTranslation();
  const [tokenBreakdown, setTokenBreakdown] = useState<UsageTokenBreakdownPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loadUsageTokenBreakdown = useCallback(async () => {
    if (!enabled) {
      setTokenBreakdown(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    setLoading(true);
    try {
      const response = await usageApi.getUsageTokenBreakdown(period, timeRange, offset);
      setTokenBreakdown(response ?? null);
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
      setTokenBreakdown(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    void loadUsageTokenBreakdown().catch(() => {});
  }, [enabled, loadUsageTokenBreakdown]);

  return {
    tokenBreakdown,
    loading,
    error,
    lastRefreshedAt,
    loadUsageTokenBreakdown,
  };
}

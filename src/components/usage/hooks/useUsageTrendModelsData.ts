import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usageApi, type UsageTrendModelsPayload } from '@/services/api/usage';
import { type UsageTimeRange } from '@/utils/usage';

export interface UseUsageTrendModelsDataReturn {
  snapshot: UsageTrendModelsPayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  loadUsageTrendModels: () => Promise<void>;
}

const getErrorMessage = (value: unknown) => (value instanceof Error ? value.message : '');

export function useUsageTrendModelsData(
  timeRange: UsageTimeRange,
  enabled: boolean
): UseUsageTrendModelsDataReturn {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<UsageTrendModelsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loadUsageTrendModels = useCallback(async () => {
    if (!enabled) {
      setSnapshot(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    setLoading(true);
    try {
      const response = await usageApi.getUsageModels(timeRange);
      setSnapshot(response ?? null);
      setError('');
      setLastRefreshedAt(new Date());
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('usage_stats.loading_error');
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [enabled, t, timeRange]);

  useEffect(() => {
    if (!enabled) {
      setSnapshot(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    void loadUsageTrendModels().catch(() => {});
  }, [enabled, loadUsageTrendModels]);

  return {
    snapshot,
    loading,
    error,
    lastRefreshedAt,
    loadUsageTrendModels,
  };
}

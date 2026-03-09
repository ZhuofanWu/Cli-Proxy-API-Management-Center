import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usageApi, type UsageGeneralPayload } from '@/services/api/usage';
import { type UsageTimeRange } from '@/utils/usage';

export interface UseUsageGeneralDataReturn {
  general: UsageGeneralPayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  loadUsageGeneral: () => Promise<void>;
}

const getErrorMessage = (value: unknown) => (value instanceof Error ? value.message : '');

export function useUsageGeneralData(
  timeRange: UsageTimeRange,
  enabled: boolean
): UseUsageGeneralDataReturn {
  const { t } = useTranslation();
  const [general, setGeneral] = useState<UsageGeneralPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loadUsageGeneral = useCallback(async () => {
    if (!enabled) {
      setGeneral(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    setLoading(true);
    try {
      const response = await usageApi.getUsageGeneral(timeRange);
      setGeneral(response ?? null);
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
      setGeneral(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    void loadUsageGeneral().catch(() => {});
  }, [enabled, loadUsageGeneral]);

  return {
    general,
    loading,
    error,
    lastRefreshedAt,
    loadUsageGeneral,
  };
}

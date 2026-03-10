import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  usageApi,
  type UsageCredentialsPayload,
} from '@/services/api/usage';
import { type UsageTimeRange } from '@/utils/usage';

export interface UseUsageCredentialsDataReturn {
  snapshot: UsageCredentialsPayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  loadUsageCredentials: () => Promise<void>;
}

const getErrorMessage = (value: unknown) => (value instanceof Error ? value.message : '');

export function useUsageCredentialsData(
  range: UsageTimeRange,
  enabled: boolean,
  percentdata: boolean
): UseUsageCredentialsDataReturn {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<UsageCredentialsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loadUsageCredentials = useCallback(async () => {
    if (!enabled) {
      setSnapshot(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    setLoading(true);
    try {
      const response = await usageApi.getUsageCredentials(range, percentdata);
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
  }, [enabled, percentdata, range, t]);

  useEffect(() => {
    if (!enabled) {
      setSnapshot(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    void loadUsageCredentials().catch(() => {});
  }, [enabled, loadUsageCredentials]);

  return {
    snapshot,
    loading,
    error,
    lastRefreshedAt,
    loadUsageCredentials,
  };
}

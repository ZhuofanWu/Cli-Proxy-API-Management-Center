import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usageApi, type UsageHealthPayload } from '@/services/api/usage';

export interface UseUsageHealthDataReturn {
  health: UsageHealthPayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  loadUsageHealth: () => Promise<void>;
}

const getErrorMessage = (value: unknown) => (value instanceof Error ? value.message : '');

export function useUsageHealthData(enabled: boolean): UseUsageHealthDataReturn {
  const { t } = useTranslation();
  const [health, setHealth] = useState<UsageHealthPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loadUsageHealth = useCallback(async () => {
    if (!enabled) {
      setHealth(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    setLoading(true);
    try {
      const response = await usageApi.getUsageHealth();
      setHealth(response ?? null);
      setError('');
      setLastRefreshedAt(new Date());
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('usage_stats.loading_error');
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [enabled, t]);

  useEffect(() => {
    if (!enabled) {
      setHealth(null);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    void loadUsageHealth().catch(() => {});
  }, [enabled, loadUsageHealth]);

  return {
    health,
    loading,
    error,
    lastRefreshedAt,
    loadUsageHealth,
  };
}

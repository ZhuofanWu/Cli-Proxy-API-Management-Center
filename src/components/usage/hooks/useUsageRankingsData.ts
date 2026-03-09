import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usageApi, type UsageRankingsPayload } from '@/services/api/usage';
import { maskUsageSensitiveValue, type ApiStats, type UsageTimeRange } from '@/utils/usage';

interface RankedModelStat {
  model: string;
  requests: number;
  successCount: number;
  failureCount: number;
  tokens: number;
  cost: number;
}

export interface UseUsageRankingsDataReturn {
  apiStats: ApiStats[];
  modelStats: RankedModelStat[];
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  loadUsageRankings: () => Promise<void>;
}

const getErrorMessage = (value: unknown) => (value instanceof Error ? value.message : '');

const toNumber = (value: unknown) => (typeof value === 'number' ? value : Number(value) || 0);

const toApiStats = (payload: UsageRankingsPayload | null): ApiStats[] =>
  (payload?.api_rankings ?? []).map((item) => {
    const rawEndpoint =
      typeof item.api_name === 'string' ? item.api_name : String(item.api_name ?? '');
    const models = (item.models ?? []).reduce<ApiStats['models']>((acc, modelItem) => {
      const modelName =
        typeof modelItem.model_name === 'string'
          ? modelItem.model_name.trim()
          : String(modelItem.model_name ?? '').trim();
      if (!modelName) {
        return acc;
      }
      acc[modelName] = {
        requests: toNumber(modelItem.requests),
        successCount: toNumber(modelItem.success_count),
        failureCount: toNumber(modelItem.failure_count),
        tokens: toNumber(modelItem.tokens),
      };
      return acc;
    }, {});

    return {
      endpoint: maskUsageSensitiveValue(rawEndpoint) || rawEndpoint,
      totalRequests: toNumber(item.total_requests),
      successCount: toNumber(item.success_count),
      failureCount: toNumber(item.failure_count),
      totalTokens: toNumber(item.total_tokens),
      totalCost: toNumber(item.total_cost),
      models,
    };
  });

const toModelStats = (payload: UsageRankingsPayload | null): RankedModelStat[] =>
  (payload?.model_rankings ?? []).map((item) => ({
    model: typeof item.model_name === 'string' ? item.model_name : String(item.model_name ?? ''),
    requests: toNumber(item.requests),
    successCount: toNumber(item.success_count),
    failureCount: toNumber(item.failure_count),
    tokens: toNumber(item.tokens),
    cost: toNumber(item.cost),
  }));

export function useUsageRankingsData(
  timeRange: UsageTimeRange,
  enabled: boolean
): UseUsageRankingsDataReturn {
  const { t } = useTranslation();
  const [apiStats, setApiStats] = useState<ApiStats[]>([]);
  const [modelStats, setModelStats] = useState<RankedModelStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const loadUsageRankings = useCallback(async () => {
    if (!enabled) {
      setApiStats([]);
      setModelStats([]);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    setLoading(true);
    try {
      const response = await usageApi.getUsageRankings(timeRange);
      const payload = response ?? null;
      setApiStats(toApiStats(payload));
      setModelStats(toModelStats(payload));
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
      setApiStats([]);
      setModelStats([]);
      setError('');
      setLoading(false);
      setLastRefreshedAt(null);
      return;
    }

    void loadUsageRankings().catch(() => {});
  }, [enabled, loadUsageRankings]);

  return {
    apiStats,
    modelStats,
    loading,
    error,
    lastRefreshedAt,
    loadUsageRankings,
  };
}

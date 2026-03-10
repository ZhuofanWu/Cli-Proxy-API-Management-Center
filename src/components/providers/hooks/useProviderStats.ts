import { useCallback, useMemo } from 'react';
import { useUsageCredentialsData } from '@/hooks/useUsageCredentialsData';
import { useInterval } from '@/hooks/useInterval';
import { USAGE_STATS_STALE_TIME_MS, useUsageStatsStore } from '@/stores';
import { buildCredentialUsageIndex } from '@/utils/credentialUsage';
import type { StatusBarData } from '@/utils/usage';

export const useProviderStats = (isSqliteUsage: boolean) => {
  const memoryKeyStats = useUsageStatsStore((state) => state.keyStats);
  const memoryUsageDetails = useUsageStatsStore((state) => state.usageDetails);
  const memoryLoading = useUsageStatsStore((state) => state.loading);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);
  const { snapshot, loading: sqliteLoading, loadUsageCredentials } = useUsageCredentialsData(
    'all',
    isSqliteUsage,
    true
  );
  const sqliteIndex = useMemo(
    () => buildCredentialUsageIndex(snapshot?.credentials ?? []),
    [snapshot?.credentials]
  );
  const emptyStatusMap = useMemo(() => new Map<string, StatusBarData>(), []);

  const loadKeyStats = useCallback(async () => {
    if (isSqliteUsage) {
      await loadUsageCredentials();
      return;
    }
    await loadUsageStats({ staleTimeMs: USAGE_STATS_STALE_TIME_MS });
  }, [isSqliteUsage, loadUsageCredentials, loadUsageStats]);

  const refreshKeyStats = useCallback(async () => {
    if (isSqliteUsage) {
      await loadUsageCredentials();
      return;
    }
    await loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS });
  }, [isSqliteUsage, loadUsageCredentials, loadUsageStats]);

  useInterval(() => {
    void refreshKeyStats().catch(() => {});
  }, 240_000);

  return {
    keyStats: isSqliteUsage ? sqliteIndex.keyStats : memoryKeyStats,
    usageDetails: isSqliteUsage ? [] : memoryUsageDetails,
    sourceStatusMap: isSqliteUsage ? sqliteIndex.sourceStatusMap : emptyStatusMap,
    loadKeyStats,
    refreshKeyStats,
    isLoading: isSqliteUsage ? sqliteLoading : memoryLoading,
  };
};

import { useCallback, useMemo } from 'react';
import { useUsageCredentialsData } from '@/hooks/useUsageCredentialsData';
import { USAGE_STATS_STALE_TIME_MS, useUsageStatsStore } from '@/stores';
import { buildCredentialUsageIndex } from '@/utils/credentialUsage';
import type { KeyStats, StatusBarData, UsageDetail } from '@/utils/usage';

export type UseAuthFilesStatsResult = {
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  authIndexStatusMap: Map<string, StatusBarData>;
  loadKeyStats: () => Promise<void>;
  refreshKeyStats: () => Promise<void>;
};

export function useAuthFilesStats(isSqliteUsage: boolean): UseAuthFilesStatsResult {
  const memoryKeyStats = useUsageStatsStore((state) => state.keyStats);
  const memoryUsageDetails = useUsageStatsStore((state) => state.usageDetails);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);
  const { snapshot, loadUsageCredentials } = useUsageCredentialsData('all', isSqliteUsage, true);
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

  return {
    keyStats: isSqliteUsage ? sqliteIndex.keyStats : memoryKeyStats,
    usageDetails: isSqliteUsage ? [] : memoryUsageDetails,
    authIndexStatusMap: isSqliteUsage ? sqliteIndex.authIndexStatusMap : emptyStatusMap,
    loadKeyStats,
    refreshKeyStats,
  };
}

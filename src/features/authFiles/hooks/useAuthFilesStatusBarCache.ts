import { useMemo } from 'react';
import type { AuthFileItem } from '@/types';
import { createEmptyCredentialStatusBarData } from '@/utils/credentialUsage';
import { calculateStatusBarData, normalizeAuthIndex, type StatusBarData, type UsageDetail } from '@/utils/usage';

export type AuthFileStatusBarData = ReturnType<typeof calculateStatusBarData>;

export function useAuthFilesStatusBarCache(
  files: AuthFileItem[],
  usageDetails: UsageDetail[],
  authIndexStatusMap?: Map<string, StatusBarData>
) {
  return useMemo(() => {
    const cache = new Map<string, AuthFileStatusBarData>();

    if (authIndexStatusMap && authIndexStatusMap.size > 0) {
      files.forEach((file) => {
        const rawAuthIndex = file['auth_index'] ?? file.authIndex;
        const authIndexKey = normalizeAuthIndex(rawAuthIndex);
        if (!authIndexKey) return;
        cache.set(
          authIndexKey,
          authIndexStatusMap.get(authIndexKey) || createEmptyCredentialStatusBarData()
        );
      });
      return cache;
    }

    files.forEach((file) => {
      const rawAuthIndex = file['auth_index'] ?? file.authIndex;
      const authIndexKey = normalizeAuthIndex(rawAuthIndex);

      if (authIndexKey) {
        const filteredDetails = usageDetails.filter((detail) => {
          const detailAuthIndex = normalizeAuthIndex(detail.auth_index);
          return detailAuthIndex !== null && detailAuthIndex === authIndexKey;
        });
        cache.set(authIndexKey, calculateStatusBarData(filteredDetails));
      }
    });

    return cache;
  }, [authIndexStatusMap, files, usageDetails]);
}

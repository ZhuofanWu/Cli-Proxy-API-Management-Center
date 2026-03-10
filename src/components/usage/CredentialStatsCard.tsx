import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  collectUsageDetails,
  buildCandidateUsageSourceIds,
  formatCompactNumber,
  normalizeAuthIndex,
  normalizeUsageSourceId,
} from '@/utils/usage';
import { authFilesApi } from '@/services/api/authFiles';
import type { UsageCredentialItem } from '@/services/api/usage';
import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from '@/types';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import type { UsagePayload } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

export interface CredentialStatsCardProps {
  usage: UsagePayload | null;
  loading: boolean;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
  sqliteCredentials?: UsageCredentialItem[] | null;
  isSqliteUsage?: boolean;
}

interface CredentialRow {
  key: string;
  displayName: string;
  type: string;
  success: number;
  failure: number;
  total: number;
  successRate: number;
}

interface CredentialBucket {
  success: number;
  failure: number;
}

export function CredentialStatsCard({
  usage,
  loading,
  geminiKeys,
  claudeConfigs,
  codexConfigs,
  vertexConfigs,
  openaiProviders,
  sqliteCredentials,
  isSqliteUsage = false,
}: CredentialStatsCardProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(new Map());

  // Fetch auth files for auth_index-based matching
  useEffect(() => {
    let cancelled = false;
    authFilesApi
      .list()
      .then((res) => {
        if (cancelled) return;
        const files = Array.isArray(res) ? res : (res as { files?: AuthFileItem[] })?.files;
        if (!Array.isArray(files)) return;
        const map = new Map<string, CredentialInfo>();
        files.forEach((file) => {
          const rawAuthIndex = file['auth_index'] ?? file.authIndex;
          const key = normalizeAuthIndex(rawAuthIndex);
          if (key) {
            map.set(key, {
              name: file.name || key,
              type: (file.type || file.provider || '').toString(),
            });
          }
        });
        setAuthFileMap(map);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Aggregate rows: all from bySource only (no separate byAuthIndex rows to avoid duplicates).
  // Auth files are used purely for name resolution of unmatched source IDs.
  const rows = useMemo((): CredentialRow[] => {
    const bySource: Record<string, CredentialBucket> = {};
    const result: CredentialRow[] = [];
    const consumedSourceIds = new Set<string>();
    const authIndexToRowIndex = new Map<string, number>();
    const sourceToAuthIndex = new Map<string, string>();
    const sourceToAuthFile = new Map<string, CredentialInfo>();
    const fallbackByAuthIndex = new Map<string, CredentialBucket>();

    if (isSqliteUsage) {
      (sqliteCredentials ?? []).forEach((item) => {
        const authIdx = normalizeAuthIndex(item.auth_index);
        const source = normalizeUsageSourceId(item.source);
        const success = typeof item.success === 'number' ? item.success : Number(item.success) || 0;
        const failure = typeof item.failure === 'number' ? item.failure : Number(item.failure) || 0;

        if (!source) {
          if (!authIdx) return;
          const fallback = fallbackByAuthIndex.get(authIdx) ?? { success: 0, failure: 0 };
          fallback.success += success;
          fallback.failure += failure;
          fallbackByAuthIndex.set(authIdx, fallback);
          return;
        }

        const bucket = bySource[source] ?? { success: 0, failure: 0 };
        bucket.success += success;
        bucket.failure += failure;
        bySource[source] = bucket;

        if (authIdx && !sourceToAuthIndex.has(source)) {
          sourceToAuthIndex.set(source, authIdx);
        }
        if (authIdx && !sourceToAuthFile.has(source)) {
          const mapped = authFileMap.get(authIdx);
          if (mapped) sourceToAuthFile.set(source, mapped);
        }
      });
    } else {
      if (!usage) return [];
      const details = collectUsageDetails(usage);

      details.forEach((detail) => {
        const authIdx = normalizeAuthIndex(detail.auth_index);
        const source = detail.source;
        const isFailed = detail.failed === true;

        if (!source) {
          if (!authIdx) return;
          const fallback = fallbackByAuthIndex.get(authIdx) ?? { success: 0, failure: 0 };
          if (isFailed) {
            fallback.failure += 1;
          } else {
            fallback.success += 1;
          }
          fallbackByAuthIndex.set(authIdx, fallback);
          return;
        }

        const bucket = bySource[source] ?? { success: 0, failure: 0 };
        if (isFailed) {
          bucket.failure += 1;
        } else {
          bucket.success += 1;
        }
        bySource[source] = bucket;

        if (authIdx && !sourceToAuthIndex.has(source)) {
          sourceToAuthIndex.set(source, authIdx);
        }
        if (authIdx && !sourceToAuthFile.has(source)) {
          const mapped = authFileMap.get(authIdx);
          if (mapped) sourceToAuthFile.set(source, mapped);
        }
      });
    }

    const mergeBucketToRow = (index: number, bucket: CredentialBucket) => {
      const target = result[index];
      if (!target) return;
      target.success += bucket.success;
      target.failure += bucket.failure;
      target.total = target.success + target.failure;
      target.successRate = target.total > 0 ? (target.success / target.total) * 100 : 100;
    };

    // Aggregate all candidate source IDs for one provider config into a single row
    const addConfigRow = (
      apiKey: string,
      prefix: string | undefined,
      name: string,
      type: string,
      rowKey: string,
    ) => {
      const candidates = buildCandidateUsageSourceIds({ apiKey, prefix });
      let success = 0;
      let failure = 0;
      candidates.forEach((id) => {
        const bucket = bySource[id];
        if (bucket) {
          success += bucket.success;
          failure += bucket.failure;
          consumedSourceIds.add(id);
        }
      });
      const total = success + failure;
      if (total > 0) {
        result.push({
          key: rowKey,
          displayName: name,
          type,
          success,
          failure,
          total,
          successRate: (success / total) * 100,
        });
      }
    };

    // Provider rows — one row per config, stats merged across all its candidate source IDs
    geminiKeys.forEach((c, i) =>
      addConfigRow(c.apiKey, c.prefix, c.prefix?.trim() || `Gemini #${i + 1}`, 'gemini', `gemini:${i}`));
    claudeConfigs.forEach((c, i) =>
      addConfigRow(c.apiKey, c.prefix, c.prefix?.trim() || `Claude #${i + 1}`, 'claude', `claude:${i}`));
    codexConfigs.forEach((c, i) =>
      addConfigRow(c.apiKey, c.prefix, c.prefix?.trim() || `Codex #${i + 1}`, 'codex', `codex:${i}`));
    vertexConfigs.forEach((c, i) =>
      addConfigRow(c.apiKey, c.prefix, c.prefix?.trim() || `Vertex #${i + 1}`, 'vertex', `vertex:${i}`));
    // OpenAI compatibility providers — one row per provider, merged across all apiKey entries (prefix counted once).
    openaiProviders.forEach((provider, providerIndex) => {
      const prefix = provider.prefix;
      const displayName = prefix?.trim() || provider.name || `OpenAI #${providerIndex + 1}`;

      const candidates = new Set<string>();
      buildCandidateUsageSourceIds({ prefix }).forEach((id) => candidates.add(id));
      (provider.apiKeyEntries || []).forEach((entry) => {
        buildCandidateUsageSourceIds({ apiKey: entry.apiKey }).forEach((id) => candidates.add(id));
      });

      let success = 0;
      let failure = 0;
      candidates.forEach((id) => {
        const bucket = bySource[id];
        if (bucket) {
          success += bucket.success;
          failure += bucket.failure;
          consumedSourceIds.add(id);
        }
      });

      const total = success + failure;
      if (total > 0) {
        result.push({
          key: `openai:${providerIndex}`,
          displayName,
          type: 'openai',
          success,
          failure,
          total,
          successRate: (success / total) * 100,
        });
      }
    });

    // Remaining unmatched bySource entries — resolve name from auth files if possible
    Object.entries(bySource).forEach(([key, bucket]) => {
      if (consumedSourceIds.has(key)) return;
      const total = bucket.success + bucket.failure;
      const authFile = sourceToAuthFile.get(key);
      const row = {
        key,
        displayName: authFile?.name || (key.startsWith('t:') ? key.slice(2) : key),
        type: authFile?.type || '',
        success: bucket.success,
        failure: bucket.failure,
        total,
        successRate: total > 0 ? (bucket.success / total) * 100 : 100,
      };
      const rowIndex = result.push(row) - 1;
      const authIdx = sourceToAuthIndex.get(key);
      if (authIdx && !authIndexToRowIndex.has(authIdx)) {
        authIndexToRowIndex.set(authIdx, rowIndex);
      }
    });

    // Include requests that have auth_index but missing source.
    fallbackByAuthIndex.forEach((bucket, authIdx) => {
      if (bucket.success + bucket.failure === 0) return;

      const mapped = authFileMap.get(authIdx);
      let targetRowIndex = authIndexToRowIndex.get(authIdx);
      if (targetRowIndex === undefined && mapped) {
        const matchedIndex = result.findIndex(
          (row) => row.displayName === mapped.name && row.type === mapped.type
        );
        if (matchedIndex >= 0) {
          targetRowIndex = matchedIndex;
          authIndexToRowIndex.set(authIdx, matchedIndex);
        }
      }

      if (targetRowIndex !== undefined) {
        mergeBucketToRow(targetRowIndex, bucket);
        return;
      }

      const total = bucket.success + bucket.failure;
      const rowIndex = result.push({
        key: `auth:${authIdx}`,
        displayName: mapped?.name || authIdx,
        type: mapped?.type || '',
        success: bucket.success,
        failure: bucket.failure,
        total,
        successRate: (bucket.success / total) * 100
      }) - 1;
      authIndexToRowIndex.set(authIdx, rowIndex);
    });

    return result.sort((a, b) => b.total - a.total);
  }, [
    usage,
    sqliteCredentials,
    isSqliteUsage,
    geminiKeys,
    claudeConfigs,
    codexConfigs,
    vertexConfigs,
    openaiProviders,
    authFileMap,
  ]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => !prev);
  };

  return (
    <Card
      title={t('usage_stats.credential_stats')}
      extra={
        <div className={styles.requestEventsActions}>
          <Button variant="ghost" size="sm" onClick={toggleCollapsed}>
            {collapsed
              ? t('usage_stats.request_events_expand')
              : t('usage_stats.request_events_collapse')}
          </Button>
        </div>
      }
      className={collapsed ? undefined : styles.detailsFixedCard}
    >
      {collapsed ? (
        <div className={styles.requestEventsCollapsedHint}>
          {loading
            ? t('common.loading')
            : rows.length === 0
              ? t('usage_stats.no_data')
              : t('usage_stats.credential_stats_collapsed_hint', { count: rows.length })}
        </div>
      ) : loading ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : rows.length > 0 ? (
        <div className={styles.detailsScroll}>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('usage_stats.credential_name')}</th>
                  <th>{t('usage_stats.requests_count')}</th>
                  <th>{t('usage_stats.success_rate')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className={styles.modelCell}>
                      <span>{row.displayName}</span>
                      {row.type && (
                        <span className={styles.credentialType}>{row.type}</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.requestCountCell}>
                        <span>{formatCompactNumber(row.total)}</span>
                        <span className={styles.requestBreakdown}>
                          (<span className={styles.statSuccess}>{row.success.toLocaleString()}</span>{' '}
                          <span className={styles.statFailure}>{row.failure.toLocaleString()}</span>)
                        </span>
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          row.successRate >= 95
                            ? styles.statSuccess
                            : row.successRate >= 80
                              ? styles.statNeutral
                              : styles.statFailure
                        }
                      >
                        {row.successRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={styles.hint}>{t('usage_stats.no_data')}</div>
      )}
    </Card>
  );
}

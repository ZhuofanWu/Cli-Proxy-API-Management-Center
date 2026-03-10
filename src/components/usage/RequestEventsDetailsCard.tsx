import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { authFilesApi } from '@/services/api/authFiles';
import {
  usageApi,
  type UsageCredentialItem,
  type UsageEventResultFilter,
  type UsageEventsPayload,
} from '@/services/api/usage';
import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import { buildSourceInfoMap, resolveSourceDisplay } from '@/utils/sourceResolver';
import {
  collectUsageDetails,
  normalizeAuthIndex,
  normalizeUsageSourceId,
  type UsageTimeRange,
} from '@/utils/usage';
import { downloadBlob } from '@/utils/download';
import styles from '@/pages/UsagePage.module.scss';

const ALL_FILTER = '__all__';
const MAX_RENDERED_EVENTS = 500;
const SQLITE_PAGE_SIZE = 100;

type RankedModelStat = {
  model: string;
};

type RequestEventRow = {
  id: string;
  timestamp: string;
  timestampMs: number;
  timestampLabel: string;
  model: string;
  sourceRaw: string;
  sourceFilterValue: string;
  source: string;
  sourceType: string;
  authIndex: string;
  authIndexValue: string;
  failed: boolean;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
};

export interface RequestEventsDetailsCardProps {
  usage: unknown;
  loading: boolean;
  isSqliteUsage: boolean;
  timeRange: UsageTimeRange;
  refreshSignal: number;
  sqliteCredentials?: UsageCredentialItem[] | null;
  sqliteModelStats?: RankedModelStat[] | null;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const toStringValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const encodeCsv = (value: string | number): string => {
  const text = String(value ?? '');
  const trimmedLeft = text.replace(/^\s+/, '');
  const safeText = trimmedLeft && /^[=+\-@]/.test(trimmedLeft) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

const formatSourceOptionLabel = (source: string, sourceType: string) =>
  sourceType ? `${source} (${sourceType})` : source;

const appendUniqueValue = (values: string[], seen: Set<string>, value: string) => {
  const trimmed = value.trim();
  if (!trimmed || seen.has(trimmed)) return;
  seen.add(trimmed);
  values.push(trimmed);
};

const appendOption = (
  target: Map<string, string>,
  value: string,
  label: string,
  allowEmpty = true
) => {
  if (!allowEmpty && !value) {
    return;
  }
  if (target.has(value)) {
    return;
  }
  target.set(value, label || '-');
};

export function RequestEventsDetailsCard({
  usage,
  loading,
  isSqliteUsage,
  timeRange,
  refreshSignal,
  sqliteCredentials = null,
  sqliteModelStats = null,
  geminiKeys,
  claudeConfigs,
  codexConfigs,
  vertexConfigs,
  openaiProviders,
}: RequestEventsDetailsCardProps) {
  const { t, i18n } = useTranslation();

  const [collapsed, setCollapsed] = useState(true);
  const [modelFilter, setModelFilter] = useState(ALL_FILTER);
  const [sourceFilter, setSourceFilter] = useState(ALL_FILTER);
  const [authIndexFilter, setAuthIndexFilter] = useState(ALL_FILTER);
  const [resultFilter, setResultFilter] = useState<UsageEventResultFilter>('all');
  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(new Map());
  const [sqlitePage, setSqlitePage] = useState(1);
  const [sqliteSnapshot, setSqliteSnapshot] = useState<UsageEventsPayload | null>(null);
  const [sqliteLoading, setSqliteLoading] = useState(false);
  const [sqliteLoaded, setSqliteLoaded] = useState(false);
  const [sqliteError, setSqliteError] = useState('');

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
          const key = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
          if (!key) return;
          map.set(key, {
            name: file.name || key,
            type: (file.type || file.provider || '').toString(),
          });
        });
        setAuthFileMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceInfoMap = useMemo(
    () =>
      buildSourceInfoMap({
        geminiApiKeys: geminiKeys,
        claudeApiKeys: claudeConfigs,
        codexApiKeys: codexConfigs,
        vertexApiKeys: vertexConfigs,
        openaiCompatibility: openaiProviders,
      }),
    [claudeConfigs, codexConfigs, geminiKeys, openaiProviders, vertexConfigs]
  );

  const buildRow = useCallback(
    ({
      idPrefix,
      timestamp,
      model,
      sourceRaw,
      sourceFilterValue,
      sourceResolveKey,
      authIndexRaw,
      failed,
      tokens,
    }: {
      idPrefix: string;
      timestamp: string;
      model: string;
      sourceRaw: string;
      sourceFilterValue: string;
      sourceResolveKey: string;
      authIndexRaw: unknown;
      failed: boolean;
      tokens: Record<string, unknown>;
    }): RequestEventRow => {
      const timestampMs = Date.parse(timestamp);
      const date = Number.isNaN(timestampMs) ? null : new Date(timestampMs);
      const authIndexValue = toStringValue(authIndexRaw);
      const sourceInfo = resolveSourceDisplay(
        sourceResolveKey,
        authIndexValue,
        sourceInfoMap,
        authFileMap
      );
      const inputTokens = Math.max(toNumber(tokens.input_tokens), 0);
      const outputTokens = Math.max(toNumber(tokens.output_tokens), 0);
      const reasoningTokens = Math.max(toNumber(tokens.reasoning_tokens), 0);
      const cachedTokens = Math.max(
        Math.max(toNumber(tokens.cached_tokens), 0),
        Math.max(toNumber(tokens.cache_tokens), 0)
      );
      const totalTokens = Math.max(
        toNumber(tokens.total_tokens),
        inputTokens + outputTokens + reasoningTokens + cachedTokens
      );

      return {
        id: `${idPrefix}-${timestamp}-${model}-${sourceRaw}-${authIndexValue}`,
        timestamp,
        timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
        timestampLabel: date ? date.toLocaleString(i18n.language) : timestamp || '-',
        model: model || '-',
        sourceRaw,
        sourceFilterValue,
        source: sourceInfo.displayName,
        sourceType: sourceInfo.type,
        authIndex: authIndexValue || '-',
        authIndexValue,
        failed,
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
        totalTokens,
      };
    },
    [authFileMap, i18n.language, sourceInfoMap]
  );

  useEffect(() => {
    if (!isSqliteUsage || collapsed) {
      return;
    }

    let cancelled = false;
    const loadSqliteEvents = async () => {
      setSqliteLoading(true);
      setSqliteError('');
      try {
        const response = await usageApi.getUsageEvents(timeRange, sqlitePage, SQLITE_PAGE_SIZE, {
          model: modelFilter === ALL_FILTER ? undefined : modelFilter,
          source: sourceFilter === ALL_FILTER ? undefined : sourceFilter,
          authIndex: authIndexFilter === ALL_FILTER ? undefined : authIndexFilter,
          result: resultFilter,
        });
        if (cancelled) return;
        setSqliteSnapshot(response ?? null);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : t('usage_stats.loading_error');
        setSqliteError(message);
      } finally {
        if (!cancelled) {
          setSqliteLoading(false);
          setSqliteLoaded(true);
        }
      }
    };

    void loadSqliteEvents();

    return () => {
      cancelled = true;
    };
  }, [
    authIndexFilter,
    collapsed,
    isSqliteUsage,
    modelFilter,
    refreshSignal,
    resultFilter,
    sourceFilter,
    sqlitePage,
    t,
    timeRange,
  ]);

  const memoryRows = useMemo<RequestEventRow[]>(() => {
    if (isSqliteUsage) {
      return [];
    }

    const details = collectUsageDetails(usage);
    return details
      .map((detail, index) =>
        buildRow({
          idPrefix: `memory-${index}`,
          timestamp: detail.timestamp,
          model: toStringValue(detail.__modelName) || '-',
          sourceRaw: toStringValue(detail.source),
          sourceFilterValue: toStringValue(detail.source),
          sourceResolveKey: toStringValue(detail.source),
          authIndexRaw: detail.auth_index,
          failed: detail.failed === true,
          tokens: (detail.tokens ?? {}) as Record<string, unknown>,
        })
      )
      .sort((a, b) => b.timestampMs - a.timestampMs);
  }, [buildRow, isSqliteUsage, usage]);

  const sqliteRows = useMemo<RequestEventRow[]>(() => {
    if (!isSqliteUsage) {
      return [];
    }

    const items = Array.isArray(sqliteSnapshot?.items) ? sqliteSnapshot.items : [];
    return items
      .map((item, index) => {
        const sourceRaw = toStringValue(item.source);
        return buildRow({
          idPrefix: `sqlite-${index}`,
          timestamp: toStringValue(item.timestamp),
          model: toStringValue(item.model_name) || '-',
          sourceRaw,
          sourceFilterValue: sourceRaw,
          sourceResolveKey: normalizeUsageSourceId(sourceRaw),
          authIndexRaw: item.auth_index,
          failed: item.failed === true,
          tokens: ((item.tokens ?? {}) as Record<string, unknown>) || {},
        });
      })
      .sort((a, b) => b.timestampMs - a.timestampMs);
  }, [buildRow, isSqliteUsage, sqliteSnapshot]);

  const memoryVisibleRows = useMemo(
    () => memoryRows.slice(0, MAX_RENDERED_EVENTS),
    [memoryRows]
  );

  const modelOptions = useMemo(() => {
    const values: string[] = [];
    const seen = new Set<string>();

    if (isSqliteUsage) {
      (sqliteModelStats ?? []).forEach((item) => appendUniqueValue(values, seen, toStringValue(item.model)));
      sqliteRows.forEach((row) => appendUniqueValue(values, seen, row.model));
      if (modelFilter !== ALL_FILTER) {
        appendUniqueValue(values, seen, modelFilter);
      }
    } else {
      memoryVisibleRows.forEach((row) => appendUniqueValue(values, seen, row.model));
    }

    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...values.map((value) => ({ value, label: value })),
    ];
  }, [isSqliteUsage, memoryVisibleRows, modelFilter, sqliteModelStats, sqliteRows, t]);

  const sourceOptions = useMemo(() => {
    const options = new Map<string, string>();

    if (isSqliteUsage) {
      (sqliteCredentials ?? []).forEach((item) => {
        const sourceValue = toStringValue(item.source);
        if (!sourceValue) return;
        const authIndexValue = toStringValue(item.auth_index);
        const sourceInfo = resolveSourceDisplay(
          normalizeUsageSourceId(sourceValue),
          authIndexValue,
          sourceInfoMap,
          authFileMap
        );
        appendOption(
          options,
          sourceValue,
          formatSourceOptionLabel(sourceInfo.displayName, sourceInfo.type),
          false
        );
      });
      sqliteRows.forEach((row) => {
        appendOption(
          options,
          row.sourceFilterValue,
          formatSourceOptionLabel(row.source, row.sourceType),
          false
        );
      });
      if (sourceFilter !== ALL_FILTER && !options.has(sourceFilter) && sourceFilter) {
        const sourceInfo = resolveSourceDisplay(
          normalizeUsageSourceId(sourceFilter),
          '',
          sourceInfoMap,
          authFileMap
        );
        appendOption(
          options,
          sourceFilter,
          formatSourceOptionLabel(sourceInfo.displayName, sourceInfo.type),
          false
        );
      }
    } else {
      memoryVisibleRows.forEach((row) => {
        appendOption(
          options,
          row.sourceFilterValue,
          formatSourceOptionLabel(row.source, row.sourceType)
        );
      });
    }

    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(options.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [
    authFileMap,
    isSqliteUsage,
    memoryVisibleRows,
    sourceFilter,
    sourceInfoMap,
    sqliteCredentials,
    sqliteRows,
    t,
  ]);

  const authIndexOptions = useMemo(() => {
    const options = new Map<string, string>();

    if (isSqliteUsage) {
      (sqliteCredentials ?? []).forEach((item) => {
        const value = toStringValue(item.auth_index);
        if (!value) return;
        appendOption(options, value, value, false);
      });
      sqliteRows.forEach((row) => appendOption(options, row.authIndexValue, row.authIndex, false));
      if (authIndexFilter !== ALL_FILTER && !options.has(authIndexFilter) && authIndexFilter) {
        appendOption(options, authIndexFilter, authIndexFilter, false);
      }
    } else {
      memoryVisibleRows.forEach((row) => appendOption(options, row.authIndexValue, row.authIndex));
    }

    return [
      { value: ALL_FILTER, label: t('usage_stats.filter_all') },
      ...Array.from(options.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [
    authIndexFilter,
    isSqliteUsage,
    memoryVisibleRows,
    sqliteCredentials,
    sqliteRows,
    t,
  ]);

  const resultOptions = useMemo(
    () => [
      { value: 'all', label: t('usage_stats.filter_all') },
      { value: 'success', label: t('stats.success') },
      { value: 'failure', label: t('stats.failure') },
    ],
    [t]
  );

  const modelOptionSet = useMemo(
    () => new Set(modelOptions.map((option) => option.value)),
    [modelOptions]
  );
  const sourceOptionSet = useMemo(
    () => new Set(sourceOptions.map((option) => option.value)),
    [sourceOptions]
  );
  const authIndexOptionSet = useMemo(
    () => new Set(authIndexOptions.map((option) => option.value)),
    [authIndexOptions]
  );
  const resultOptionSet = useMemo(
    () => new Set(resultOptions.map((option) => option.value)),
    [resultOptions]
  );

  const effectiveModelFilter = modelOptionSet.has(modelFilter) ? modelFilter : ALL_FILTER;
  const effectiveSourceFilter = sourceOptionSet.has(sourceFilter) ? sourceFilter : ALL_FILTER;
  const effectiveAuthIndexFilter = authIndexOptionSet.has(authIndexFilter)
    ? authIndexFilter
    : ALL_FILTER;
  const effectiveResultFilter = resultOptionSet.has(resultFilter) ? resultFilter : 'all';

  const filteredMemoryRows = useMemo(
    () =>
      memoryVisibleRows.filter((row) => {
        const modelMatched =
          effectiveModelFilter === ALL_FILTER || row.model === effectiveModelFilter;
        const sourceMatched =
          effectiveSourceFilter === ALL_FILTER || row.sourceFilterValue === effectiveSourceFilter;
        const authIndexMatched =
          effectiveAuthIndexFilter === ALL_FILTER ||
          row.authIndexValue === effectiveAuthIndexFilter;
        const resultMatched =
          effectiveResultFilter === 'all' ||
          (effectiveResultFilter === 'success' ? !row.failed : row.failed);
        return modelMatched && sourceMatched && authIndexMatched && resultMatched;
      }),
    [
      effectiveAuthIndexFilter,
      effectiveModelFilter,
      effectiveResultFilter,
      effectiveSourceFilter,
      memoryVisibleRows,
    ]
  );

  const filteredRows = isSqliteUsage ? sqliteRows : filteredMemoryRows;
  const collapsedHintCount = Math.min(memoryRows.length, MAX_RENDERED_EVENTS);
  const totalCount = isSqliteUsage
    ? Math.max(0, toNumber(sqliteSnapshot?.total))
    : filteredMemoryRows.length;
  const totalPages = isSqliteUsage
    ? Math.max(1, toNumber(sqliteSnapshot?.total_pages) || 1)
    : 1;
  const currentPage = isSqliteUsage
    ? Math.max(1, toNumber(sqliteSnapshot?.page) || sqlitePage)
    : 1;
  const isCurrentLoading = isSqliteUsage ? sqliteLoading : loading;
  const isInitialSqliteLoad = isSqliteUsage && !sqliteLoaded;

  const hasActiveFilters =
    effectiveModelFilter !== ALL_FILTER ||
    effectiveSourceFilter !== ALL_FILTER ||
    effectiveAuthIndexFilter !== ALL_FILTER ||
    effectiveResultFilter !== 'all';

  const handleClearFilters = useCallback(() => {
    setModelFilter(ALL_FILTER);
    setSourceFilter(ALL_FILTER);
    setAuthIndexFilter(ALL_FILTER);
    setResultFilter('all');
    if (isSqliteUsage) {
      setSqlitePage(1);
    }
  }, [isSqliteUsage]);

  const handleModelFilterChange = useCallback(
    (value: string) => {
      setModelFilter(value);
      if (isSqliteUsage) {
        setSqlitePage(1);
      }
    },
    [isSqliteUsage]
  );

  const handleSourceFilterChange = useCallback(
    (value: string) => {
      setSourceFilter(value);
      if (isSqliteUsage) {
        setSqlitePage(1);
      }
    },
    [isSqliteUsage]
  );

  const handleAuthIndexFilterChange = useCallback(
    (value: string) => {
      setAuthIndexFilter(value);
      if (isSqliteUsage) {
        setSqlitePage(1);
      }
    },
    [isSqliteUsage]
  );

  const handleResultFilterChange = useCallback(
    (value: string) => {
      setResultFilter((resultOptionSet.has(value) ? value : 'all') as UsageEventResultFilter);
      if (isSqliteUsage) {
        setSqlitePage(1);
      }
    },
    [isSqliteUsage, resultOptionSet]
  );

  const toggleCollapsed = () => {
    setCollapsed((prev) => !prev);
  };

  const handleExportCsv = () => {
    if (!filteredRows.length) return;

    const csvHeader = [
      'timestamp',
      'model',
      'source',
      'source_raw',
      'auth_index',
      'result',
      'input_tokens',
      'output_tokens',
      'reasoning_tokens',
      'cached_tokens',
      'total_tokens',
    ];

    const csvRows = filteredRows.map((row) =>
      [
        row.timestamp,
        row.model,
        row.source,
        row.sourceRaw,
        row.authIndexValue,
        row.failed ? 'failed' : 'success',
        row.inputTokens,
        row.outputTokens,
        row.reasoningTokens,
        row.cachedTokens,
        row.totalTokens,
      ]
        .map((value) => encodeCsv(value))
        .join(',')
    );

    const content = [csvHeader.join(','), ...csvRows].join('\n');
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob({
      filename: `usage-events-${fileTime}.csv`,
      blob: new Blob([content], { type: 'text/csv;charset=utf-8' }),
    });
  };

  const handleExportJson = () => {
    if (!filteredRows.length) return;

    const payload = filteredRows.map((row) => ({
      timestamp: row.timestamp,
      model: row.model,
      source: row.source,
      source_raw: row.sourceRaw,
      auth_index: row.authIndexValue,
      failed: row.failed,
      tokens: {
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
        reasoning_tokens: row.reasoningTokens,
        cached_tokens: row.cachedTokens,
        total_tokens: row.totalTokens,
      },
    }));

    const content = JSON.stringify(payload, null, 2);
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob({
      filename: `usage-events-${fileTime}.json`,
      blob: new Blob([content], { type: 'application/json;charset=utf-8' }),
    });
  };

  const handlePageBackward = useCallback(() => {
    if (!isSqliteUsage || sqliteLoading) {
      return;
    }
    setSqlitePage((prev) => Math.max(1, prev - 1));
  }, [isSqliteUsage, sqliteLoading]);

  const handlePageForward = useCallback(() => {
    if (!isSqliteUsage || sqliteLoading) {
      return;
    }
    setSqlitePage((prev) => prev + 1);
  }, [isSqliteUsage, sqliteLoading]);

  const hasRowsToShow = totalCount > 0 && filteredRows.length > 0;

  return (
    <Card
      title={t('usage_stats.request_events_title')}
      extra={
        <div className={styles.requestEventsActions}>
          {!collapsed && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                disabled={!hasActiveFilters}
              >
                {t('usage_stats.clear_filters')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportCsv}
                disabled={filteredRows.length === 0 || (isSqliteUsage && sqliteLoading)}
              >
                {t('usage_stats.export_csv')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportJson}
                disabled={filteredRows.length === 0 || (isSqliteUsage && sqliteLoading)}
              >
                {t('usage_stats.export_json')}
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={toggleCollapsed}>
            {collapsed
              ? t('usage_stats.request_events_expand')
              : t('usage_stats.request_events_collapse')}
          </Button>
        </div>
      }
    >
      {collapsed ? (
        <div className={styles.requestEventsCollapsedHint}>
          {isSqliteUsage
            ? sqliteLoading
              ? t('common.loading')
              : !sqliteLoaded
                ? t('usage_stats.request_events_sqlite_lazy_hint')
                : totalCount === 0
                  ? t('usage_stats.request_events_empty_desc')
                  : t('usage_stats.request_events_sqlite_collapsed_hint', { count: totalCount })
            : loading
              ? t('common.loading')
              : memoryRows.length === 0
                ? t('usage_stats.request_events_empty_desc')
                : t('usage_stats.request_events_collapsed_hint', { count: collapsedHintCount })}
        </div>
      ) : (
        <>
          <div className={styles.requestEventsToolbar}>
            <div className={styles.requestEventsToolbarMain}>
              <div className={styles.requestEventsFilterItem}>
                <span className={styles.requestEventsFilterLabel}>
                  {t('usage_stats.request_events_filter_model')}
                </span>
                <Select
                  value={effectiveModelFilter}
                  options={modelOptions}
                  onChange={handleModelFilterChange}
                  className={styles.requestEventsSelect}
                  ariaLabel={t('usage_stats.request_events_filter_model')}
                  fullWidth={false}
                />
              </div>
              <div className={styles.requestEventsFilterItem}>
                <span className={styles.requestEventsFilterLabel}>
                  {t('usage_stats.request_events_filter_source')}
                </span>
                <Select
                  value={effectiveSourceFilter}
                  options={sourceOptions}
                  onChange={handleSourceFilterChange}
                  className={styles.requestEventsSelect}
                  ariaLabel={t('usage_stats.request_events_filter_source')}
                  fullWidth={false}
                />
              </div>
              <div className={styles.requestEventsFilterItem}>
                <span className={styles.requestEventsFilterLabel}>
                  {t('usage_stats.request_events_filter_auth_index')}
                </span>
                <Select
                  value={effectiveAuthIndexFilter}
                  options={authIndexOptions}
                  onChange={handleAuthIndexFilterChange}
                  className={styles.requestEventsSelect}
                  ariaLabel={t('usage_stats.request_events_filter_auth_index')}
                  fullWidth={false}
                />
              </div>
              <div className={styles.requestEventsFilterItem}>
                <span className={styles.requestEventsFilterLabel}>
                  {t('usage_stats.request_events_filter_result')}
                </span>
                <Select
                  value={effectiveResultFilter}
                  options={resultOptions}
                  onChange={handleResultFilterChange}
                  className={styles.requestEventsSelect}
                  ariaLabel={t('usage_stats.request_events_filter_result')}
                  fullWidth={false}
                />
              </div>
            </div>
            <div className={styles.requestEventsToolbarPager}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePageBackward}
                disabled={!isSqliteUsage || sqliteLoading || currentPage <= 1}
              >
                {t('auth_files.pagination_prev')}
              </Button>
              <span className={styles.requestEventsPageInfo}>
                {t('usage_stats.request_events_pagination_info', {
                  current: currentPage,
                  total: totalPages,
                  count: totalCount,
                })}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePageForward}
                disabled={
                  !isSqliteUsage ||
                  sqliteLoading ||
                  currentPage >= totalPages ||
                  !sqliteSnapshot?.has_next
                }
              >
                {t('auth_files.pagination_next')}
              </Button>
            </div>
          </div>

          {isSqliteUsage && sqliteError && <div className={styles.errorBox}>{sqliteError}</div>}

          {isCurrentLoading && filteredRows.length === 0 ? (
            <div className={styles.hint}>{t('common.loading')}</div>
          ) : isInitialSqliteLoad ? (
            <div className={styles.hint}>{t('common.loading')}</div>
          ) : totalCount === 0 ? (
            <EmptyState
              title={
                hasActiveFilters
                  ? t('usage_stats.request_events_no_result_title')
                  : t('usage_stats.request_events_empty_title')
              }
              description={
                hasActiveFilters
                  ? t('usage_stats.request_events_no_result_desc')
                  : t('usage_stats.request_events_empty_desc')
              }
            />
          ) : !hasRowsToShow ? (
            <div className={styles.hint}>{t('common.loading')}</div>
          ) : (
            <>
              <div className={styles.requestEventsMeta}>
                <span>{t('usage_stats.request_events_count', { count: totalCount })}</span>
                {!isSqliteUsage && memoryRows.length > MAX_RENDERED_EVENTS && (
                  <span className={styles.requestEventsLimitHint}>
                    {t('usage_stats.request_events_memory_limit_hint', {
                      count: MAX_RENDERED_EVENTS,
                    })}
                  </span>
                )}
              </div>

              <div className={styles.requestEventsTableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>{t('usage_stats.request_events_timestamp')}</th>
                      <th>{t('usage_stats.model_name')}</th>
                      <th>{t('usage_stats.request_events_source')}</th>
                      <th>{t('usage_stats.request_events_auth_index')}</th>
                      <th>{t('usage_stats.request_events_result')}</th>
                      <th>{t('usage_stats.input_tokens')}</th>
                      <th>{t('usage_stats.output_tokens')}</th>
                      <th>{t('usage_stats.reasoning_tokens')}</th>
                      <th>{t('usage_stats.cached_tokens')}</th>
                      <th>{t('usage_stats.total_tokens')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.id}>
                        <td title={row.timestamp} className={styles.requestEventsTimestamp}>
                          {row.timestampLabel}
                        </td>
                        <td className={styles.modelCell}>{row.model}</td>
                        <td className={styles.requestEventsSourceCell} title={row.source}>
                          <span>{row.source}</span>
                          {row.sourceType && (
                            <span className={styles.credentialType}>{row.sourceType}</span>
                          )}
                        </td>
                        <td className={styles.requestEventsAuthIndex} title={row.authIndex}>
                          {row.authIndex}
                        </td>
                        <td>
                          <span
                            className={
                              row.failed
                                ? styles.requestEventsResultFailed
                                : styles.requestEventsResultSuccess
                            }
                          >
                            {row.failed ? t('stats.failure') : t('stats.success')}
                          </span>
                        </td>
                        <td>{row.inputTokens.toLocaleString()}</td>
                        <td>{row.outputTokens.toLocaleString()}</td>
                        <td>{row.reasoningTokens.toLocaleString()}</td>
                        <td>{row.cachedTokens.toLocaleString()}</td>
                        <td>{row.totalTokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}

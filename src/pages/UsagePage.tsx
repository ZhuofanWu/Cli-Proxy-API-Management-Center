import { useState, useMemo, useCallback, useEffect, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select } from '@/components/ui/Select';
import { useUsageCredentialsData } from '@/hooks/useUsageCredentialsData';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useThemeStore, useConfigStore } from '@/stores';
import {
  StatCards,
  UsageChart,
  ChartLineSelector,
  ApiDetailsCard,
  ModelStatsCard,
  CredentialStatsCard,
  RequestEventsDetailsCard,
  TokenBreakdownChart,
  CostTrendChart,
  ServiceHealthCard,
  useUsageData,
  useUsageGeneralData,
  useUsageHealthData,
  useUsageRankingsData,
  useUsageMetricTrendData,
  useUsageCostTrendData,
  useUsageTrendModelsData,
  useUsageTokenBreakdownData,
  useUsageGeneralSparklines,
  useSparklines,
  useChartData,
} from '@/components/usage';
import {
  getModelNamesFromUsage,
  getApiStats,
  getModelStats,
  type ModelPrice,
  type UsageTimeRange,
} from '@/utils/usage';
import {
  type UsageChartGranularity,
  type UsageCostTrendGranularity,
  type UsageTokenBreakdownGranularity,
} from '@/services/api/usage';
import styles from './UsagePage.module.scss';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const CHART_LINES_STORAGE_KEY = 'cli-proxy-usage-chart-lines-v1';
const TIME_RANGE_STORAGE_KEY = 'cli-proxy-usage-time-range-v1';
const DEFAULT_CHART_LINES = ['all'];
const DEFAULT_TIME_RANGE: UsageTimeRange = '24h';
const MAX_CHART_LINES = 9;
const TOKEN_BREAKDOWN_PAGE_DAYS = 30;
const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: UsageTimeRange; labelKey: string }> = [
  { value: 'all', labelKey: 'usage_stats.range_all' },
  { value: '7h', labelKey: 'usage_stats.range_7h' },
  { value: '24h', labelKey: 'usage_stats.range_24h' },
  { value: '7d', labelKey: 'usage_stats.range_7d' },
];
const HOUR_WINDOW_BY_TIME_RANGE: Record<Exclude<UsageTimeRange, 'all'>, number> = {
  '7h': 7,
  '24h': 24,
  '7d': 7 * 24,
};
const EMPTY_MODEL_PRICES: Record<string, ModelPrice> = {};

const isUsageTimeRange = (value: unknown): value is UsageTimeRange =>
  value === '7h' || value === '24h' || value === '7d' || value === 'all';

const normalizeChartLines = (value: unknown, maxLines = MAX_CHART_LINES): string[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_CHART_LINES;
  }

  const filtered = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  return filtered.length ? filtered : DEFAULT_CHART_LINES;
};

const loadChartLines = (): string[] => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_CHART_LINES;
    }
    const raw = localStorage.getItem(CHART_LINES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CHART_LINES;
    }
    return normalizeChartLines(JSON.parse(raw));
  } catch {
    return DEFAULT_CHART_LINES;
  }
};

const loadTimeRange = (): UsageTimeRange => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_TIME_RANGE;
    }
    const raw = localStorage.getItem(TIME_RANGE_STORAGE_KEY);
    return isUsageTimeRange(raw) ? raw : DEFAULT_TIME_RANGE;
  } catch {
    return DEFAULT_TIME_RANGE;
  }
};

export function UsagePage() {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const isDark = resolvedTheme === 'dark';
  const config = useConfigStore((state) => state.config);
  const modelPrices = config?.modelPrices ?? EMPTY_MODEL_PRICES;
  const hasPrices = Object.keys(modelPrices).length > 0;
  const isSqliteUsage = config?.usageStatisticsStorageWay === 'sqlite';

  const [chartLines, setChartLines] = useState<string[]>(loadChartLines);
  const [timeRange, setTimeRange] = useState<UsageTimeRange>(loadTimeRange);
  const [requestsPeriod, setRequestsPeriod] = useState<UsageChartGranularity>('day');
  const [tokensPeriod, setTokensPeriod] = useState<UsageChartGranularity>('day');
  const [tokenBreakdownPeriod, setTokenBreakdownPeriod] =
    useState<UsageTokenBreakdownGranularity>('hour');
  const [tokenBreakdownOffset, setTokenBreakdownOffset] = useState(0);
  const [costTrendPeriod, setCostTrendPeriod] = useState<UsageCostTrendGranularity>('hour');
  const [costTrendOffset, setCostTrendOffset] = useState(0);

  // Data hook
  const {
    usage,
    loading,
    error,
    lastRefreshedAt,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange: baseHandleImportChange,
    importInputRef,
    exporting,
    importing,
  } = useUsageData(timeRange, !isSqliteUsage);

  const {
    general,
    loading: generalLoading,
    error: generalError,
    lastRefreshedAt: generalLastRefreshedAt,
    loadUsageGeneral,
  } = useUsageGeneralData(timeRange, isSqliteUsage);

  const {
    health,
    loading: healthLoading,
    error: healthError,
    lastRefreshedAt: healthLastRefreshedAt,
    loadUsageHealth,
  } = useUsageHealthData(isSqliteUsage);

  const {
    snapshot: credentialsSnapshot,
    loading: credentialsLoading,
    error: credentialsError,
    lastRefreshedAt: credentialsLastRefreshedAt,
    loadUsageCredentials,
  } = useUsageCredentialsData(timeRange, isSqliteUsage, false);

  const {
    apiStats: sqliteApiStats,
    modelStats: sqliteModelStats,
    loading: rankingsLoading,
    error: rankingsError,
    lastRefreshedAt: rankingsLastRefreshedAt,
    loadUsageRankings,
  } = useUsageRankingsData(timeRange, isSqliteUsage);

  const {
    snapshot: trendModelsSnapshot,
    loading: trendModelsLoading,
    error: trendModelsError,
    lastRefreshedAt: trendModelsLastRefreshedAt,
    loadUsageTrendModels,
  } = useUsageTrendModelsData(timeRange, isSqliteUsage);

  const {
    trend: requestsTrend,
    loading: requestsTrendLoading,
    error: requestsTrendError,
    lastRefreshedAt: requestsTrendLastRefreshedAt,
    loadUsageMetricTrend: loadUsageRequestTrend,
  } = useUsageMetricTrendData('requests', requestsPeriod, timeRange, chartLines, isSqliteUsage);

  const {
    trend: tokensTrend,
    loading: tokensTrendLoading,
    error: tokensTrendError,
    lastRefreshedAt: tokensTrendLastRefreshedAt,
    loadUsageMetricTrend: loadUsageTokenTrend,
  } = useUsageMetricTrendData('tokens', tokensPeriod, timeRange, chartLines, isSqliteUsage);

  const {
    tokenBreakdown,
    loading: tokenBreakdownLoading,
    error: tokenBreakdownError,
    lastRefreshedAt: tokenBreakdownLastRefreshedAt,
    loadUsageTokenBreakdown,
  } = useUsageTokenBreakdownData(
    tokenBreakdownPeriod,
    timeRange,
    tokenBreakdownOffset,
    isSqliteUsage
  );

  const {
    costTrend,
    loading: costTrendLoading,
    error: costTrendError,
    lastRefreshedAt: costTrendLastRefreshedAt,
    loadUsageCostTrend,
  } = useUsageCostTrendData(
    costTrendPeriod,
    timeRange,
    costTrendOffset,
    isSqliteUsage && hasPrices
  );

  const loadPageData = useCallback(async () => {
    if (isSqliteUsage) {
      await Promise.all([
        loadUsageGeneral(),
        loadUsageHealth(),
        loadUsageCredentials(),
        loadUsageRankings(),
        loadUsageTrendModels(),
        loadUsageRequestTrend(),
        loadUsageTokenTrend(),
        loadUsageTokenBreakdown(),
        loadUsageCostTrend(),
      ]);
      return;
    }
    await loadUsage();
  }, [
    isSqliteUsage,
    loadUsage,
    loadUsageGeneral,
    loadUsageHealth,
    loadUsageCredentials,
    loadUsageRankings,
    loadUsageTrendModels,
    loadUsageRequestTrend,
    loadUsageTokenTrend,
    loadUsageTokenBreakdown,
    loadUsageCostTrend,
  ]);

  useHeaderRefresh(loadPageData);

  const timeRangeOptions = useMemo(
    () =>
      TIME_RANGE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: t(opt.labelKey),
      })),
    [t]
  );

  const hourWindowHours = timeRange === 'all' ? undefined : HOUR_WINDOW_BY_TIME_RANGE[timeRange];

  const handleChartLinesChange = useCallback((lines: string[]) => {
    setChartLines(normalizeChartLines(lines));
  }, []);

  const handleTimeRangeChange = useCallback(
    (value: UsageTimeRange) => {
      setTimeRange(value);
      if (value !== 'all' || tokenBreakdownPeriod !== 'day') {
        setTokenBreakdownOffset(0);
      }
      if (value !== 'all' || costTrendPeriod !== 'day') {
        setCostTrendOffset(0);
      }
    },
    [costTrendPeriod, tokenBreakdownPeriod]
  );

  const handleTokenBreakdownPeriodChange = useCallback(
    (value: UsageTokenBreakdownGranularity) => {
      setTokenBreakdownPeriod(value);
      if (value !== 'day' || timeRange !== 'all') {
        setTokenBreakdownOffset(0);
      }
    },
    [timeRange]
  );

  const handleCostTrendPeriodChange = useCallback(
    (value: UsageCostTrendGranularity) => {
      setCostTrendPeriod(value);
      if (value !== 'day' || timeRange !== 'all') {
        setCostTrendOffset(0);
      }
    },
    [timeRange]
  );

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(CHART_LINES_STORAGE_KEY, JSON.stringify(chartLines));
    } catch {
      // Ignore storage errors.
    }
  }, [chartLines]);

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(TIME_RANGE_STORAGE_KEY, timeRange);
    } catch {
      // Ignore storage errors.
    }
  }, [timeRange]);

  const effectiveLastRefreshedAt = isSqliteUsage
    ? (generalLastRefreshedAt ??
      trendModelsLastRefreshedAt ??
      requestsTrendLastRefreshedAt ??
      tokensTrendLastRefreshedAt ??
      rankingsLastRefreshedAt ??
      healthLastRefreshedAt ??
      credentialsLastRefreshedAt ??
      tokenBreakdownLastRefreshedAt ??
      costTrendLastRefreshedAt)
    : lastRefreshedAt;
  const nowMs = effectiveLastRefreshedAt?.getTime() ?? 0;

  // Sparklines hook
  const { requestsSparkline, tokensSparkline, rpmSparkline, tpmSparkline, costSparkline } =
    useSparklines({ usage, loading, nowMs });

  const {
    requestsSparkline: generalRequestsSparkline,
    tokensSparkline: generalTokensSparkline,
    rpmSparkline: generalRpmSparkline,
    tpmSparkline: generalTpmSparkline,
    costSparkline: generalCostSparkline,
  } = useUsageGeneralSparklines({ general, loading: generalLoading });

  const statCardSparklines = isSqliteUsage
    ? {
        requests: generalRequestsSparkline,
        tokens: generalTokensSparkline,
        rpm: generalRpmSparkline,
        tpm: generalTpmSparkline,
        cost: generalCostSparkline,
      }
    : {
        requests: requestsSparkline,
        tokens: tokensSparkline,
        rpm: rpmSparkline,
        tpm: tpmSparkline,
        cost: costSparkline,
      };

  const statCardsLoading = isSqliteUsage ? generalLoading : loading;
  const pageError = [
    error,
    generalError,
    healthError,
    credentialsError,
    rankingsError,
    trendModelsError,
    requestsTrendError,
    tokensTrendError,
    tokenBreakdownError,
    costTrendError,
  ]
    .filter(Boolean)
    .join('；');
  const serviceHealthLoading = isSqliteUsage ? healthLoading : loading;
  const tokenBreakdownCardLoading = isSqliteUsage ? tokenBreakdownLoading : loading;
  const tokenBreakdownPagingEnabled =
    isSqliteUsage && tokenBreakdownPeriod === 'day' && timeRange === 'all';
  const canPageToOlderTokenBreakdown =
    tokenBreakdownPagingEnabled && Boolean(tokenBreakdown?.has_older);
  const canPageToNewerTokenBreakdown = tokenBreakdownPagingEnabled && tokenBreakdownOffset > 0;
  const costTrendCardLoading = isSqliteUsage && hasPrices ? costTrendLoading : loading;
  const detailsCardLoading = isSqliteUsage ? rankingsLoading : loading;
  const requestsChartLoading = isSqliteUsage ? requestsTrendLoading : loading;
  const tokensChartLoading = isSqliteUsage ? tokensTrendLoading : loading;
  const costTrendPagingEnabled = isSqliteUsage && costTrendPeriod === 'day' && timeRange === 'all';
  const canPageToOlderCostTrend = costTrendPagingEnabled && Boolean(costTrend?.has_older);
  const canPageToNewerCostTrend = costTrendPagingEnabled && costTrendOffset > 0;

  const handleRefresh = useCallback(() => {
    void loadPageData().catch(() => {});
  }, [loadPageData]);

  const handleImportChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      await baseHandleImportChange(event);
      if (isSqliteUsage) {
        await Promise.all([
          loadUsageGeneral().catch(() => {}),
          loadUsageHealth().catch(() => {}),
          loadUsageCredentials().catch(() => {}),
          loadUsageRankings().catch(() => {}),
          loadUsageTrendModels().catch(() => {}),
          loadUsageRequestTrend().catch(() => {}),
          loadUsageTokenTrend().catch(() => {}),
          loadUsageTokenBreakdown().catch(() => {}),
          loadUsageCostTrend().catch(() => {}),
        ]);
      }
    },
    [
      baseHandleImportChange,
      isSqliteUsage,
      loadUsageGeneral,
      loadUsageHealth,
      loadUsageCredentials,
      loadUsageRankings,
      loadUsageTrendModels,
      loadUsageRequestTrend,
      loadUsageTokenTrend,
      loadUsageTokenBreakdown,
      loadUsageCostTrend,
    ]
  );

  const handleTokenBreakdownPageToOlder = useCallback(() => {
    if (!canPageToOlderTokenBreakdown) {
      return;
    }
    setTokenBreakdownOffset((prev) => prev + TOKEN_BREAKDOWN_PAGE_DAYS);
  }, [canPageToOlderTokenBreakdown]);

  const handleTokenBreakdownPageToNewer = useCallback(() => {
    if (!canPageToNewerTokenBreakdown) {
      return;
    }
    setTokenBreakdownOffset((prev) => Math.max(prev - TOKEN_BREAKDOWN_PAGE_DAYS, 0));
  }, [canPageToNewerTokenBreakdown]);

  const handleCostTrendPageToOlder = useCallback(() => {
    if (!canPageToOlderCostTrend) {
      return;
    }
    setCostTrendOffset((prev) => prev + TOKEN_BREAKDOWN_PAGE_DAYS);
  }, [canPageToOlderCostTrend]);

  const handleCostTrendPageToNewer = useCallback(() => {
    if (!canPageToNewerCostTrend) {
      return;
    }
    setCostTrendOffset((prev) => Math.max(prev - TOKEN_BREAKDOWN_PAGE_DAYS, 0));
  }, [canPageToNewerCostTrend]);

  // Chart data hook
  const { requestsChartData, tokensChartData, requestsChartOptions, tokensChartOptions } =
    useChartData({
      usage,
      chartLines,
      isDark,
      isMobile,
      hourWindowHours,
      requestsPeriod,
      tokensPeriod,
      sqliteRequestsTrend: isSqliteUsage ? requestsTrend : null,
      sqliteTokensTrend: isSqliteUsage ? tokensTrend : null,
    });

  // Derived data
  const memoryModelNames = useMemo(() => getModelNamesFromUsage(usage), [usage]);
  const sqliteModelNames = useMemo(() => {
    const fetchedModels = (trendModelsSnapshot?.models ?? [])
      .map((item) => (typeof item.model_name === 'string' ? item.model_name.trim() : ''))
      .filter(Boolean);
    const selectedModels = chartLines.filter((line) => line !== 'all');
    return Array.from(new Set([...fetchedModels, ...selectedModels]));
  }, [chartLines, trendModelsSnapshot?.models]);
  const modelNames = isSqliteUsage ? sqliteModelNames : memoryModelNames;
  const memoryApiStats = useMemo(() => getApiStats(usage, modelPrices), [usage, modelPrices]);
  const memoryModelStats = useMemo(() => getModelStats(usage, modelPrices), [usage, modelPrices]);
  const apiStats = isSqliteUsage ? sqliteApiStats : memoryApiStats;
  const modelStats = isSqliteUsage ? sqliteModelStats : memoryModelStats;

  return (
    <div className={styles.container}>
      {loading && !usage && (
        <div className={styles.loadingOverlay} aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner size={28} className={styles.loadingOverlaySpinner} />
            <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('usage_stats.title')}</h1>
        <div className={styles.headerActions}>
          <div className={styles.timeRangeGroup}>
            <span className={styles.timeRangeLabel}>{t('usage_stats.range_filter')}</span>
            <Select
              value={timeRange}
              options={timeRangeOptions}
              onChange={(value) => handleTimeRangeChange(value as UsageTimeRange)}
              className={styles.timeRangeSelectControl}
              ariaLabel={t('usage_stats.range_filter')}
              fullWidth={false}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            loading={exporting}
            disabled={loading || importing}
          >
            {t('usage_stats.export')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImport}
            loading={importing}
            disabled={loading || exporting}
          >
            {t('usage_stats.import')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={
              loading ||
              generalLoading ||
              healthLoading ||
              rankingsLoading ||
              trendModelsLoading ||
              requestsTrendLoading ||
              tokensTrendLoading ||
              tokenBreakdownLoading ||
              costTrendLoading ||
              exporting ||
              importing
            }
          >
            {loading ||
            generalLoading ||
            healthLoading ||
            rankingsLoading ||
            trendModelsLoading ||
            requestsTrendLoading ||
            tokensTrendLoading ||
            tokenBreakdownLoading ||
            costTrendLoading
              ? t('common.loading')
              : t('usage_stats.refresh')}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(event) => {
              void handleImportChange(event);
            }}
          />
          {effectiveLastRefreshedAt && (
            <span className={styles.lastRefreshed}>
              {t('usage_stats.last_updated')}: {effectiveLastRefreshedAt.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {pageError && <div className={styles.errorBox}>{pageError}</div>}

      {/* Stats Overview Cards */}
      <StatCards
        usage={usage}
        loading={statCardsLoading}
        modelPrices={modelPrices}
        nowMs={nowMs}
        generalSummary={general?.summary ?? null}
        sparklines={statCardSparklines}
      />

      {/* Service Health */}
      <ServiceHealthCard
        usage={usage}
        health={isSqliteUsage ? health : null}
        loading={serviceHealthLoading}
      />

      {/* Chart Line Selection */}
      <ChartLineSelector
        chartLines={chartLines}
        modelNames={modelNames}
        maxLines={MAX_CHART_LINES}
        onChange={handleChartLinesChange}
      />

      {/* Charts Grid */}
      <div className={styles.chartsGrid}>
        <UsageChart
          title={t('usage_stats.requests_trend')}
          period={requestsPeriod}
          onPeriodChange={setRequestsPeriod}
          chartData={requestsChartData}
          chartOptions={requestsChartOptions}
          loading={requestsChartLoading}
          isMobile={isMobile}
          emptyText={t('usage_stats.no_data')}
        />
        <UsageChart
          title={t('usage_stats.tokens_trend')}
          period={tokensPeriod}
          onPeriodChange={setTokensPeriod}
          chartData={tokensChartData}
          chartOptions={tokensChartOptions}
          loading={tokensChartLoading}
          isMobile={isMobile}
          emptyText={t('usage_stats.no_data')}
        />
      </div>

      {/* Token Breakdown Chart */}
      <TokenBreakdownChart
        usage={usage}
        loading={tokenBreakdownCardLoading}
        isDark={isDark}
        isMobile={isMobile}
        hourWindowHours={hourWindowHours}
        period={tokenBreakdownPeriod}
        onPeriodChange={handleTokenBreakdownPeriodChange}
        sqliteBreakdown={isSqliteUsage ? tokenBreakdown : null}
        showPagination
        canPageBackward={canPageToOlderTokenBreakdown}
        canPageForward={canPageToNewerTokenBreakdown}
        onPageBackward={handleTokenBreakdownPageToOlder}
        onPageForward={handleTokenBreakdownPageToNewer}
      />

      {/* Cost Trend Chart */}
      <CostTrendChart
        usage={usage}
        loading={costTrendCardLoading}
        isDark={isDark}
        isMobile={isMobile}
        modelPrices={modelPrices}
        hourWindowHours={hourWindowHours}
        period={costTrendPeriod}
        onPeriodChange={handleCostTrendPeriodChange}
        sqliteCostTrend={isSqliteUsage ? costTrend : null}
        showPagination
        canPageBackward={canPageToOlderCostTrend}
        canPageForward={canPageToNewerCostTrend}
        onPageBackward={handleCostTrendPageToOlder}
        onPageForward={handleCostTrendPageToNewer}
      />

      {/* Details Grid */}
      <div className={styles.detailsGrid}>
        <ApiDetailsCard apiStats={apiStats} loading={detailsCardLoading} hasPrices={hasPrices} />
        <ModelStatsCard
          modelStats={modelStats}
          loading={detailsCardLoading}
          hasPrices={hasPrices}
        />
      </div>

      <RequestEventsDetailsCard
        usage={usage}
        loading={loading}
        isSqliteUsage={isSqliteUsage}
        timeRange={timeRange}
        refreshSignal={effectiveLastRefreshedAt?.getTime() ?? 0}
        sqliteCredentials={isSqliteUsage ? credentialsSnapshot?.credentials ?? [] : null}
        sqliteModelStats={isSqliteUsage ? sqliteModelStats : null}
        geminiKeys={config?.geminiApiKeys || []}
        claudeConfigs={config?.claudeApiKeys || []}
        codexConfigs={config?.codexApiKeys || []}
        vertexConfigs={config?.vertexApiKeys || []}
        openaiProviders={config?.openaiCompatibility || []}
      />

      {/* Credential Stats */}
      <CredentialStatsCard
        usage={usage}
        loading={isSqliteUsage ? credentialsLoading : loading}
        geminiKeys={config?.geminiApiKeys || []}
        claudeConfigs={config?.claudeApiKeys || []}
        codexConfigs={config?.codexApiKeys || []}
        vertexConfigs={config?.vertexApiKeys || []}
        openaiProviders={config?.openaiCompatibility || []}
        sqliteCredentials={isSqliteUsage ? credentialsSnapshot?.credentials ?? [] : null}
        isSqliteUsage={isSqliteUsage}
      />
    </div>
  );
}

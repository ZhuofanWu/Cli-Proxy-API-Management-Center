import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Line } from 'react-chartjs-2';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  buildHourlyTokenBreakdown,
  buildDailyTokenBreakdown,
  type TokenBreakdownSeries,
  type TokenCategory,
} from '@/utils/usage';
import { buildChartOptions, getHourChartMinWidth } from '@/utils/usage/chartConfig';
import { type UsageTokenBreakdownPayload } from '@/services/api/usage';
import type { UsagePayload } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

const TOKEN_COLORS: Record<TokenCategory, { border: string; bg: string }> = {
  input: { border: '#8b8680', bg: 'rgba(139, 134, 128, 0.25)' },
  output: { border: '#22c55e', bg: 'rgba(34, 197, 94, 0.25)' },
  cached: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.25)' },
  reasoning: { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.25)' },
};

const CATEGORIES: TokenCategory[] = ['input', 'output', 'cached', 'reasoning'];

function PagerChevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      className={styles.chartPagerIcon}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={direction === 'left' ? 'M9.5 3.5L5 8l4.5 4.5' : 'M6.5 3.5L11 8l-4.5 4.5'}
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface TokenBreakdownChartProps {
  usage: UsagePayload | null;
  loading: boolean;
  isDark: boolean;
  isMobile: boolean;
  hourWindowHours?: number;
  period: 'hour' | 'day';
  onPeriodChange: (period: 'hour' | 'day') => void;
  sqliteBreakdown?: UsageTokenBreakdownPayload | null;
  showPagination?: boolean;
  canPageBackward?: boolean;
  canPageForward?: boolean;
  onPageBackward?: () => void;
  onPageForward?: () => void;
}

const buildSqliteTokenBreakdownSeries = (
  payload: UsageTokenBreakdownPayload | null | undefined
): TokenBreakdownSeries => {
  const buckets = Array.isArray(payload?.buckets) ? payload.buckets : [];
  return {
    labels: buckets.map((bucket) => (typeof bucket?.label === 'string' ? bucket.label : '')),
    dataByCategory: {
      input: buckets.map((bucket) =>
        typeof bucket?.input_tokens === 'number' ? bucket.input_tokens : 0
      ),
      output: buckets.map((bucket) =>
        typeof bucket?.output_tokens === 'number' ? bucket.output_tokens : 0
      ),
      cached: buckets.map((bucket) =>
        typeof bucket?.cached_tokens === 'number' ? bucket.cached_tokens : 0
      ),
      reasoning: buckets.map((bucket) =>
        typeof bucket?.reasoning_tokens === 'number' ? bucket.reasoning_tokens : 0
      ),
    },
    hasData: buckets.some(
      (bucket) =>
        (typeof bucket?.input_tokens === 'number' ? bucket.input_tokens : 0) > 0 ||
        (typeof bucket?.output_tokens === 'number' ? bucket.output_tokens : 0) > 0 ||
        (typeof bucket?.cached_tokens === 'number' ? bucket.cached_tokens : 0) > 0 ||
        (typeof bucket?.reasoning_tokens === 'number' ? bucket.reasoning_tokens : 0) > 0
    ),
  };
};

export function TokenBreakdownChart({
  usage,
  loading,
  isDark,
  isMobile,
  hourWindowHours,
  period,
  onPeriodChange,
  sqliteBreakdown = null,
  showPagination = false,
  canPageBackward = false,
  canPageForward = false,
  onPageBackward,
  onPageForward,
}: TokenBreakdownChartProps) {
  const { t } = useTranslation();

  const { chartData, chartOptions } = useMemo(() => {
    const series = sqliteBreakdown
      ? buildSqliteTokenBreakdownSeries(sqliteBreakdown)
      : period === 'hour'
        ? buildHourlyTokenBreakdown(usage, hourWindowHours)
        : buildDailyTokenBreakdown(usage);
    const categoryLabels: Record<TokenCategory, string> = {
      input: t('usage_stats.input_tokens'),
      output: t('usage_stats.output_tokens'),
      cached: t('usage_stats.cached_tokens'),
      reasoning: t('usage_stats.reasoning_tokens'),
    };

    const data = {
      labels: series.labels,
      datasets: CATEGORIES.map((cat) => ({
        label: categoryLabels[cat],
        data: series.dataByCategory[cat],
        borderColor: TOKEN_COLORS[cat].border,
        backgroundColor: TOKEN_COLORS[cat].bg,
        pointBackgroundColor: TOKEN_COLORS[cat].border,
        pointBorderColor: TOKEN_COLORS[cat].border,
        fill: true,
        tension: 0.35,
      })),
    };

    const baseOptions = buildChartOptions({ period, labels: series.labels, isDark, isMobile });
    const options = {
      ...baseOptions,
      scales: {
        ...baseOptions.scales,
        y: {
          ...baseOptions.scales?.y,
          stacked: true,
        },
        x: {
          ...baseOptions.scales?.x,
          stacked: true,
        },
      },
    };

    return { chartData: data, chartOptions: options };
  }, [hourWindowHours, isDark, isMobile, period, sqliteBreakdown, t, usage]);

  const hasChartData = chartData.labels.length > 0;

  return (
    <Card
      title={t('usage_stats.token_breakdown')}
      extra={
        <div className={styles.tokenBreakdownHeaderActions}>
          {showPagination && (
            <div
              className={styles.tokenBreakdownPager}
              aria-label={t('usage_stats.token_breakdown')}
            >
              <Button
                variant="secondary"
                size="sm"
                className={styles.chartPagerButton}
                onClick={onPageBackward}
                disabled={!canPageBackward}
                aria-label={t('auth_files.pagination_prev')}
                title={t('auth_files.pagination_prev')}
              >
                <PagerChevron direction="left" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className={styles.chartPagerButton}
                onClick={onPageForward}
                disabled={!canPageForward}
                aria-label={t('auth_files.pagination_next')}
                title={t('auth_files.pagination_next')}
              >
                <PagerChevron direction="right" />
              </Button>
            </div>
          )}
          <div className={styles.periodButtons}>
            <Button
              variant={period === 'hour' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onPeriodChange('hour')}
            >
              {t('usage_stats.by_hour')}
            </Button>
            <Button
              variant={period === 'day' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => onPeriodChange('day')}
            >
              {t('usage_stats.by_day')}
            </Button>
          </div>
        </div>
      }
    >
      {hasChartData ? (
        <div
          className={styles.chartState}
          aria-busy={loading}
          aria-live={loading ? 'polite' : undefined}
        >
          <div className={styles.chartWrapper}>
            <div className={styles.chartLegend} aria-label="Chart legend">
              {chartData.datasets.map((dataset, index) => (
                <div
                  key={`${dataset.label}-${index}`}
                  className={styles.legendItem}
                  title={dataset.label}
                >
                  <span
                    className={styles.legendDot}
                    style={{ backgroundColor: dataset.borderColor }}
                  />
                  <span className={styles.legendLabel}>{dataset.label}</span>
                </div>
              ))}
            </div>
            <div className={styles.chartArea}>
              <div className={styles.chartScroller}>
                <div
                  className={styles.chartCanvas}
                  style={
                    period === 'hour'
                      ? { minWidth: getHourChartMinWidth(chartData.labels.length, isMobile) }
                      : undefined
                  }
                >
                  <Line data={chartData} options={chartOptions} />
                </div>
              </div>
            </div>
          </div>
          {loading && (
            <div className={styles.chartStateOverlay}>
              <div className={styles.chartStateOverlayContent}>
                <LoadingSpinner size={20} />
                <span>{t('common.loading')}</span>
              </div>
            </div>
          )}
        </div>
      ) : loading ? (
        <div className={styles.chartPlaceholder} aria-busy="true" aria-live="polite">
          <div className={styles.chartPlaceholderBody}>
            <LoadingSpinner size={20} />
            <span>{t('common.loading')}</span>
          </div>
        </div>
      ) : (
        <div className={styles.chartPlaceholder}>
          <div className={styles.chartPlaceholderBody}>{t('usage_stats.no_data')}</div>
        </div>
      )}
    </Card>
  );
}

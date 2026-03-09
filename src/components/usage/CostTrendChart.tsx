import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScriptableContext } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  buildHourlyCostSeries,
  buildDailyCostSeries,
  formatUsd,
  type ModelPrice,
} from '@/utils/usage';
import { buildChartOptions, getHourChartMinWidth } from '@/utils/usage/chartConfig';
import { type UsageCostTrendPayload } from '@/services/api/usage';
import type { UsagePayload } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

export interface CostTrendChartProps {
  usage: UsagePayload | null;
  loading: boolean;
  isDark: boolean;
  isMobile: boolean;
  modelPrices: Record<string, ModelPrice>;
  hourWindowHours?: number;
  period: 'hour' | 'day';
  onPeriodChange: (period: 'hour' | 'day') => void;
  sqliteCostTrend?: UsageCostTrendPayload | null;
  showPagination?: boolean;
  canPageBackward?: boolean;
  canPageForward?: boolean;
  onPageBackward?: () => void;
  onPageForward?: () => void;
}

const COST_COLOR = '#f59e0b';
const COST_BG = 'rgba(245, 158, 11, 0.15)';

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

function buildGradient(ctx: ScriptableContext<'line'>) {
  const chart = ctx.chart;
  const area = chart.chartArea;
  if (!area) return COST_BG;
  const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
  gradient.addColorStop(0, 'rgba(245, 158, 11, 0.28)');
  gradient.addColorStop(0.6, 'rgba(245, 158, 11, 0.12)');
  gradient.addColorStop(1, 'rgba(245, 158, 11, 0.02)');
  return gradient;
}

export function CostTrendChart({
  usage,
  loading,
  isDark,
  isMobile,
  modelPrices,
  hourWindowHours,
  period,
  onPeriodChange,
  sqliteCostTrend = null,
  showPagination = false,
  canPageBackward = false,
  canPageForward = false,
  onPageBackward,
  onPageForward,
}: CostTrendChartProps) {
  const { t } = useTranslation();
  const hasPrices = Object.keys(modelPrices).length > 0;

  const { chartData, chartOptions, hasData } = useMemo(() => {
    if (!hasPrices || (!sqliteCostTrend && !usage)) {
      return { chartData: { labels: [], datasets: [] }, chartOptions: {}, hasData: false };
    }

    const series = sqliteCostTrend
      ? {
          labels: Array.isArray(sqliteCostTrend.buckets)
            ? sqliteCostTrend.buckets.map((bucket) =>
                typeof bucket?.label === 'string' ? bucket.label : ''
              )
            : [],
          data: Array.isArray(sqliteCostTrend.buckets)
            ? sqliteCostTrend.buckets.map((bucket) =>
                typeof bucket?.cost === 'number' ? bucket.cost : 0
              )
            : [],
          hasData: Array.isArray(sqliteCostTrend.buckets)
            ? sqliteCostTrend.buckets.some(
                (bucket) => (typeof bucket?.cost === 'number' ? bucket.cost : 0) > 0
              )
            : false,
        }
      : period === 'hour'
        ? buildHourlyCostSeries(usage, modelPrices, hourWindowHours)
        : buildDailyCostSeries(usage, modelPrices);

    const data = {
      labels: series.labels,
      datasets: [
        {
          label: t('usage_stats.total_cost'),
          data: series.data,
          borderColor: COST_COLOR,
          backgroundColor: buildGradient,
          pointBackgroundColor: COST_COLOR,
          pointBorderColor: COST_COLOR,
          fill: true,
          tension: 0.35,
        },
      ],
    };

    const baseOptions = buildChartOptions({ period, labels: series.labels, isDark, isMobile });
    const options = {
      ...baseOptions,
      scales: {
        ...baseOptions.scales,
        y: {
          ...baseOptions.scales?.y,
          ticks: {
            ...(baseOptions.scales?.y && 'ticks' in baseOptions.scales.y
              ? baseOptions.scales.y.ticks
              : {}),
            callback: (value: string | number) => formatUsd(Number(value)),
          },
        },
      },
    };

    return { chartData: data, chartOptions: options, hasData: series.hasData };
  }, [
    usage,
    sqliteCostTrend,
    period,
    isDark,
    isMobile,
    modelPrices,
    hasPrices,
    hourWindowHours,
    t,
  ]);

  return (
    <Card
      title={t('usage_stats.cost_trend')}
      extra={
        <div className={styles.tokenBreakdownHeaderActions}>
          {showPagination && (
            <div className={styles.tokenBreakdownPager} aria-label={t('usage_stats.cost_trend')}>
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
      {loading ? (
        <div className={styles.hint}>{t('common.loading')}</div>
      ) : !hasPrices ? (
        <div className={styles.hint}>{t('usage_stats.cost_need_price')}</div>
      ) : !hasData ? (
        <div className={styles.hint}>{t('usage_stats.cost_no_data')}</div>
      ) : (
        <div className={styles.chartWrapper}>
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
      )}
    </Card>
  );
}

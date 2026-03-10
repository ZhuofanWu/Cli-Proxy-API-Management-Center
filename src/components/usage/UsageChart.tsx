import { useTranslation } from 'react-i18next';
import type { ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { ChartData } from '@/utils/usage';
import { getHourChartMinWidth } from '@/utils/usage/chartConfig';
import styles from '@/pages/UsagePage.module.scss';

export interface UsageChartProps {
  title: string;
  period: 'hour' | 'day';
  onPeriodChange: (period: 'hour' | 'day') => void;
  chartData: ChartData;
  chartOptions: ChartOptions<'line'>;
  loading: boolean;
  isMobile: boolean;
  emptyText: string;
  showPagination?: boolean;
  canPageBackward?: boolean;
  canPageForward?: boolean;
  onPageBackward?: () => void;
  onPageForward?: () => void;
}

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

export function UsageChart({
  title,
  period,
  onPeriodChange,
  chartData,
  chartOptions,
  loading,
  isMobile,
  emptyText,
  showPagination = false,
  canPageBackward = false,
  canPageForward = false,
  onPageBackward,
  onPageForward,
}: UsageChartProps) {
  const { t } = useTranslation();
  const hasChartData = chartData.labels.length > 0;

  return (
    <Card
      title={title}
      extra={
        <div className={styles.tokenBreakdownHeaderActions}>
          {showPagination && (
            <div className={styles.tokenBreakdownPager} aria-label={title}>
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
          <div className={styles.chartPlaceholderBody}>{emptyText}</div>
        </div>
      )}
    </Card>
  );
}

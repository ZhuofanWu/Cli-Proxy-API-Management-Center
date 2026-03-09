import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  collectUsageDetails,
  calculateServiceHealthData,
  type ServiceHealthData,
  type StatusBlockState,
  type StatusBlockDetail,
} from '@/utils/usage';
import type { UsagePayload } from './hooks/useUsageData';
import type { UsageHealthPayload } from '@/services/api/usage';
import styles from '@/pages/UsagePage.module.scss';

const DEFAULT_ROWS = 7;
const DEFAULT_COLS = 96;
const DEFAULT_BUCKET_MINUTES = 15;

function createEmptyHealthData(rows = DEFAULT_ROWS, cols = DEFAULT_COLS): ServiceHealthData {
  const blockCount = rows * cols;
  const bucketMs = DEFAULT_BUCKET_MINUTES * 60 * 1000;
  const windowStart = Date.now() - blockCount * bucketMs;

  const blocks: StatusBlockState[] = Array.from({ length: blockCount }, () => 'idle');
  const blockDetails: StatusBlockDetail[] = Array.from({ length: blockCount }, (_, index) => {
    const startTime = windowStart + index * bucketMs;
    return {
      success: 0,
      failure: 0,
      rate: -1,
      startTime,
      endTime: startTime + bucketMs,
    };
  });

  return {
    blocks,
    blockDetails,
    successRate: 100,
    totalSuccess: 0,
    totalFailure: 0,
    rows,
    cols,
  };
}

function normalizeCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function normalizeRate(value: unknown, success: number, failure: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(-1, Math.min(100, Math.round(value)));
  }
  const total = success + failure;
  if (total <= 0) {
    return -1;
  }
  return Math.round((success * 100) / total);
}

function buildServiceHealthDataFromBackend(health: UsageHealthPayload | null): ServiceHealthData {
  const rows =
    typeof health?.rows === 'number' && Number.isFinite(health.rows) && health.rows > 0
      ? Math.round(health.rows)
      : DEFAULT_ROWS;
  const cols =
    typeof health?.cols === 'number' && Number.isFinite(health.cols) && health.cols > 0
      ? Math.round(health.cols)
      : DEFAULT_COLS;
  const blockCount = rows * cols;
  const bucketMinutes =
    typeof health?.bucket_minutes === 'number' &&
    Number.isFinite(health.bucket_minutes) &&
    health.bucket_minutes > 0
      ? Math.round(health.bucket_minutes)
      : DEFAULT_BUCKET_MINUTES;
  const bucketMs = bucketMinutes * 60 * 1000;

  const parsedStart = Date.parse(health?.window_start ?? '');
  const parsedEnd = Date.parse(health?.window_end ?? '');
  const windowStart = Number.isFinite(parsedStart)
    ? parsedStart
    : Number.isFinite(parsedEnd)
      ? parsedEnd - blockCount * bucketMs
      : Date.now() - blockCount * bucketMs;

  if (!health) {
    return createEmptyHealthData(rows, cols);
  }

  const rates = Array.isArray(health.rates) ? health.rates : [];
  const successCounts = Array.isArray(health.success_counts) ? health.success_counts : [];
  const failureCounts = Array.isArray(health.failure_counts) ? health.failure_counts : [];

  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];
  let totalSuccess = 0;
  let totalFailure = 0;

  for (let index = 0; index < blockCount; index += 1) {
    const success = normalizeCount(successCounts[index]);
    const failure = normalizeCount(failureCounts[index]);
    const total = success + failure;
    const ratePercent = normalizeRate(rates[index], success, failure);
    const startTime = windowStart + index * bucketMs;

    totalSuccess += success;
    totalFailure += failure;

    if (total === 0) {
      blocks.push('idle');
    } else if (failure === 0) {
      blocks.push('success');
    } else if (success === 0) {
      blocks.push('failure');
    } else {
      blocks.push('mixed');
    }

    blockDetails.push({
      success,
      failure,
      rate: total > 0 ? ratePercent / 100 : -1,
      startTime,
      endTime: startTime + bucketMs,
    });
  }

  const totalRequests = totalSuccess + totalFailure;
  const successRate =
    totalRequests > 0
      ? (totalSuccess / totalRequests) * 100
      : typeof health.success_rate === 'number' && Number.isFinite(health.success_rate)
        ? health.success_rate
        : 100;

  return {
    blocks,
    blockDetails,
    successRate,
    totalSuccess,
    totalFailure,
    rows,
    cols,
  };
}

const COLOR_STOPS = [
  { r: 239, g: 68, b: 68 },   // #ef4444
  { r: 250, g: 204, b: 21 },  // #facc15
  { r: 34, g: 197, b: 94 },   // #22c55e
] as const;

function rateToColor(rate: number): string {
  const t = Math.max(0, Math.min(1, rate));
  const segment = t < 0.5 ? 0 : 1;
  const localT = segment === 0 ? t * 2 : (t - 0.5) * 2;
  const from = COLOR_STOPS[segment];
  const to = COLOR_STOPS[segment + 1];
  const r = Math.round(from.r + (to.r - from.r) * localT);
  const g = Math.round(from.g + (to.g - from.g) * localT);
  const b = Math.round(from.b + (to.b - from.b) * localT);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${h}:${m}`;
}

export interface ServiceHealthCardProps {
  usage: UsagePayload | null;
  health?: UsageHealthPayload | null;
  loading: boolean;
}

export function ServiceHealthCard({ usage, health = null, loading }: ServiceHealthCardProps) {
  const { t } = useTranslation();
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const healthData: ServiceHealthData = useMemo(() => {
    if (health) {
      return buildServiceHealthDataFromBackend(health);
    }
    const details = usage ? collectUsageDetails(usage) : [];
    return calculateServiceHealthData(details);
  }, [health, usage]);

  const hasData = healthData.totalSuccess + healthData.totalFailure > 0;

  useEffect(() => {
    if (activeTooltip === null) return;
    const handler = (e: PointerEvent) => {
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [activeTooltip]);

  const handlePointerEnter = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.pointerType === 'mouse') {
      setActiveTooltip(idx);
    }
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') {
      setActiveTooltip(null);
    }
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.pointerType === 'touch') {
      e.preventDefault();
      setActiveTooltip((prev) => (prev === idx ? null : idx));
    }
  }, []);

  const getTooltipPositionClass = (idx: number): string => {
    const col = Math.floor(idx / healthData.rows);
    if (col <= 2) return styles.healthTooltipLeft;
    if (col >= healthData.cols - 3) return styles.healthTooltipRight;
    return '';
  };

  const getTooltipVerticalClass = (idx: number): string => {
    const row = idx % healthData.rows;
    if (row <= 1) return styles.healthTooltipBelow;
    return '';
  };

  const renderTooltip = (detail: StatusBlockDetail, idx: number) => {
    const total = detail.success + detail.failure;
    const posClass = getTooltipPositionClass(idx);
    const vertClass = getTooltipVerticalClass(idx);
    const timeRange = `${formatDateTime(detail.startTime)} – ${formatDateTime(detail.endTime)}`;

    return (
      <div className={`${styles.healthTooltip} ${posClass} ${vertClass}`}>
        <span className={styles.healthTooltipTime}>{timeRange}</span>
        {total > 0 ? (
          <span className={styles.healthTooltipStats}>
            <span className={styles.healthTooltipSuccess}>{t('status_bar.success_short')} {detail.success}</span>
            <span className={styles.healthTooltipFailure}>{t('status_bar.failure_short')} {detail.failure}</span>
            <span className={styles.healthTooltipRate}>({(detail.rate * 100).toFixed(1)}%)</span>
          </span>
        ) : (
          <span className={styles.healthTooltipStats}>{t('status_bar.no_requests')}</span>
        )}
      </div>
    );
  };

  const rateClass = !hasData
    ? ''
    : healthData.successRate >= 90
      ? styles.healthRateHigh
      : healthData.successRate >= 50
        ? styles.healthRateMedium
        : styles.healthRateLow;

  return (
    <div className={styles.healthCard}>
      <div className={styles.healthHeader}>
        <h3 className={styles.healthTitle}>{t('service_health.title')}</h3>
        <div className={styles.healthMeta}>
          <span className={styles.healthWindow}>{t('service_health.window')}</span>
          <span className={`${styles.healthRate} ${rateClass}`}>
            {loading ? '--' : hasData ? `${healthData.successRate.toFixed(1)}%` : '--'}
          </span>
        </div>
      </div>
      <div className={styles.healthGridScroller}>
        <div
          className={styles.healthGrid}
          ref={gridRef}
        >
        {healthData.blockDetails.map((detail, idx) => {
          const isIdle = detail.rate === -1;
          const blockStyle = isIdle ? undefined : { backgroundColor: rateToColor(detail.rate) };
          const isActive = activeTooltip === idx;

          return (
            <div
              key={idx}
              className={`${styles.healthBlockWrapper} ${isActive ? styles.healthBlockActive : ''}`}
              onPointerEnter={(e) => handlePointerEnter(e, idx)}
              onPointerLeave={handlePointerLeave}
              onPointerDown={(e) => handlePointerDown(e, idx)}
            >
              <div
                className={`${styles.healthBlock} ${isIdle ? styles.healthBlockIdle : ''}`}
                style={blockStyle}
              />
              {isActive && renderTooltip(detail, idx)}
            </div>
          );
        })}
      </div>
      </div>
      <div className={styles.healthLegend}>
        <span className={styles.healthLegendLabel}>{t('service_health.oldest')}</span>
        <div className={styles.healthLegendColors}>
          <div className={`${styles.healthLegendBlock} ${styles.healthBlockIdle}`} />
          <div className={styles.healthLegendBlock} style={{ backgroundColor: '#ef4444' }} />
          <div className={styles.healthLegendBlock} style={{ backgroundColor: '#facc15' }} />
          <div className={styles.healthLegendBlock} style={{ backgroundColor: '#22c55e' }} />
        </div>
        <span className={styles.healthLegendLabel}>{t('service_health.newest')}</span>
      </div>
    </div>
  );
}

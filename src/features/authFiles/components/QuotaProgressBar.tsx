import { getQuotaFillColor, normalizeQuotaPercent } from '@/utils/quota';
import styles from '@/pages/AuthFilesPage.module.scss';

export type QuotaProgressBarProps = {
  percent: number | null;
  highThreshold?: number;
  mediumThreshold?: number;
};

export function QuotaProgressBar({
  percent,
  highThreshold,
  mediumThreshold
}: QuotaProgressBarProps) {
  const normalized = normalizeQuotaPercent(percent);
  const widthPercent = Math.round(normalized ?? 0);
  const backgroundColor = getQuotaFillColor(normalized, { highThreshold, mediumThreshold });

  return (
    <div className={styles.quotaBar}>
      <div className={styles.quotaBarFill} style={{ width: `${widthPercent}%`, backgroundColor }} />
    </div>
  );
}


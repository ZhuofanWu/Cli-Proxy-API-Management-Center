/**
 * Shared quota progress color helpers.
 */

const QUOTA_DANGER_COLOR = 'var(--quota-danger-color, var(--danger-color, #f5222d))';
const QUOTA_ORANGE_COLOR = 'var(--quota-orange-color, #FA8C16)';
const QUOTA_LIME_COLOR = 'var(--quota-lime-color, #A0D911)';
const QUOTA_SAFE_COLOR = 'var(--quota-safe-color, var(--success-color, #10b981))';
const DEFAULT_HIGH_THRESHOLD = 80;
const DEFAULT_MEDIUM_THRESHOLD = 50;
const DEFAULT_DANGER_THRESHOLD = 20;

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

const buildColorMix = (fromColor: string, toColor: string, progress: number): string => {
  const normalizedProgress = Math.min(1, Math.max(0, progress));
  if (normalizedProgress <= 0) return fromColor;
  if (normalizedProgress >= 1) return toColor;

  return `color-mix(in srgb, ${toColor} ${Math.round(normalizedProgress * 100)}%, ${fromColor})`;
};

export const normalizeQuotaPercent = (percent: number | null): number | null => {
  if (percent === null || !Number.isFinite(percent)) return null;
  return clampPercent(percent);
};

export interface QuotaProgressThresholds {
  highThreshold?: number;
  mediumThreshold?: number;
}

const resolveThresholds = (
  highThreshold?: number,
  mediumThreshold?: number
): { high: number; medium: number; danger: number } => {
  const medium = clampPercent(mediumThreshold ?? DEFAULT_MEDIUM_THRESHOLD);
  const high = clampPercent(Math.max(highThreshold ?? DEFAULT_HIGH_THRESHOLD, medium));
  const danger = Math.min(DEFAULT_DANGER_THRESHOLD, medium);

  return { high, medium, danger };
};

const buildSegmentColor = (
  value: number,
  start: number,
  end: number,
  fromColor: string,
  toColor: string
): string => {
  if (end <= start) return toColor;
  return buildColorMix(fromColor, toColor, (value - start) / (end - start));
};

export const getQuotaFillColor = (
  percent: number | null,
  thresholds?: QuotaProgressThresholds
): string => {
  const normalized = normalizeQuotaPercent(percent);
  if (normalized === null) return QUOTA_ORANGE_COLOR;
  const { high, medium, danger } = resolveThresholds(
    thresholds?.highThreshold,
    thresholds?.mediumThreshold
  );

  if (normalized <= danger) {
    return QUOTA_DANGER_COLOR;
  }

  if (normalized <= medium) {
    return buildSegmentColor(
      normalized,
      danger,
      medium,
      QUOTA_DANGER_COLOR,
      QUOTA_ORANGE_COLOR
    );
  }

  if (normalized <= high) {
    return buildSegmentColor(
      normalized,
      medium,
      high,
      QUOTA_ORANGE_COLOR,
      QUOTA_LIME_COLOR
    );
  }

  return buildSegmentColor(normalized, high, 100, QUOTA_LIME_COLOR, QUOTA_SAFE_COLOR);
};

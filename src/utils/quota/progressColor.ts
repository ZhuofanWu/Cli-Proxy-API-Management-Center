/**
 * Shared quota progress color helpers.
 */

const QUOTA_DANGER_COLOR = 'var(--quota-danger-color, var(--danger-color, #f5222d))';
const QUOTA_ORANGE_COLOR = 'var(--quota-orange-color, #FA8C16)';
const QUOTA_LIME_COLOR = 'var(--quota-lime-color, #A0D911)';
const QUOTA_SAFE_COLOR = 'var(--quota-safe-color, var(--success-color, #10b981))';

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

export const getQuotaFillColor = (percent: number | null): string => {
  const normalized = normalizeQuotaPercent(percent);
  if (normalized === null) return QUOTA_ORANGE_COLOR;

  if (normalized <= 20) {
    return QUOTA_DANGER_COLOR;
  }

  if (normalized <= 50) {
    return buildColorMix(QUOTA_DANGER_COLOR, QUOTA_ORANGE_COLOR, (normalized - 20) / 30);
  }

  if (normalized <= 80) {
    return buildColorMix(QUOTA_ORANGE_COLOR, QUOTA_LIME_COLOR, (normalized - 50) / 30);
  }

  return buildColorMix(QUOTA_LIME_COLOR, QUOTA_SAFE_COLOR, (normalized - 80) / 20);
};

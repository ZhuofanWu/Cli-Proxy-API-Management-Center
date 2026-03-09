import { useCallback, useMemo } from 'react';
import type { UsageGeneralPayload, UsageGeneralPoint } from '@/services/api/usage';
import type { SparklineBundle, UseSparklinesReturn } from './useSparklines';

interface UseUsageGeneralSparklinesOptions {
  general: UsageGeneralPayload | null;
  loading: boolean;
}

const toSparklineLabel = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const hours = parsed.getHours().toString().padStart(2, '0');
  const minutes = parsed.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

export function useUsageGeneralSparklines({
  general,
  loading,
}: UseUsageGeneralSparklinesOptions): UseSparklinesReturn {
  const buildSparkline = useCallback(
    (
      points: UsageGeneralPoint[] | undefined,
      color: string,
      backgroundColor: string
    ): SparklineBundle | null => {
      if (loading || !points?.length) {
        return null;
      }
      return {
        data: {
          labels: points.map((point) => toSparklineLabel(point.ts)),
          datasets: [
            {
              data: points.map((point) => point.value ?? 0),
              borderColor: color,
              backgroundColor,
              fill: true,
              tension: 0.45,
              pointRadius: 0,
              borderWidth: 2,
            },
          ],
        },
      };
    },
    [loading]
  );

  const requestsSparkline = useMemo(
    () =>
      buildSparkline(
        general?.series?.requests_60m,
        '#8b8680',
        'rgba(139, 134, 128, 0.18)'
      ),
    [buildSparkline, general?.series?.requests_60m]
  );

  const tokensSparkline = useMemo(
    () =>
      buildSparkline(
        general?.series?.tokens_60m,
        '#8b5cf6',
        'rgba(139, 92, 246, 0.18)'
      ),
    [buildSparkline, general?.series?.tokens_60m]
  );

  const rpmSparkline = useMemo(
    () =>
      buildSparkline(general?.series?.rpm_30m, '#22c55e', 'rgba(34, 197, 94, 0.18)'),
    [buildSparkline, general?.series?.rpm_30m]
  );

  const tpmSparkline = useMemo(
    () =>
      buildSparkline(general?.series?.tpm_30m, '#f97316', 'rgba(249, 115, 22, 0.18)'),
    [buildSparkline, general?.series?.tpm_30m]
  );

  const costSparkline = useMemo(() => {
    if (!general?.summary?.cost_available) {
      return null;
    }
    return buildSparkline(general?.series?.cost_30m, '#f59e0b', 'rgba(245, 158, 11, 0.18)');
  }, [buildSparkline, general?.series?.cost_30m, general?.summary?.cost_available]);

  return {
    requestsSparkline,
    tokensSparkline,
    rpmSparkline,
    tpmSparkline,
    costSparkline,
  };
}

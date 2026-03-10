import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { buildChartData, type ChartData } from '@/utils/usage';
import { buildChartOptions } from '@/utils/usage/chartConfig';
import type { UsageMetricTrendPayload } from '@/services/api/usage';
import type { UsagePayload } from './useUsageData';

const SQLITE_CHART_COLORS = [
  { borderColor: '#8b8680', backgroundColor: 'rgba(139, 134, 128, 0.15)' },
  { borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.15)' },
  { borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  { borderColor: '#c65746', backgroundColor: 'rgba(198, 87, 70, 0.15)' },
  { borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.15)' },
  { borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.15)' },
  { borderColor: '#ec4899', backgroundColor: 'rgba(236, 72, 153, 0.15)' },
  { borderColor: '#84cc16', backgroundColor: 'rgba(132, 204, 22, 0.15)' },
  { borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.15)' },
];

export interface UseChartDataOptions {
  usage: UsagePayload | null;
  chartLines: string[];
  isDark: boolean;
  isMobile: boolean;
  hourWindowHours?: number;
  requestsPeriod: 'hour' | 'day';
  tokensPeriod: 'hour' | 'day';
  sqliteRequestsTrend?: UsageMetricTrendPayload | null;
  sqliteTokensTrend?: UsageMetricTrendPayload | null;
}

export interface UseChartDataReturn {
  requestsChartData: ChartData;
  tokensChartData: ChartData;
  requestsChartOptions: ChartOptions<'line'>;
  tokensChartOptions: ChartOptions<'line'>;
}

export function useChartData({
  usage,
  chartLines,
  isDark,
  isMobile,
  hourWindowHours,
  requestsPeriod,
  tokensPeriod,
  sqliteRequestsTrend,
  sqliteTokensTrend,
}: UseChartDataOptions): UseChartDataReturn {
  const requestsChartData = useMemo(() => {
    if (sqliteRequestsTrend) {
      return buildTrendChartData(sqliteRequestsTrend, chartLines);
    }
    if (!usage) return { labels: [], datasets: [] };
    return buildChartData(usage, requestsPeriod, 'requests', chartLines, { hourWindowHours });
  }, [chartLines, hourWindowHours, requestsPeriod, sqliteRequestsTrend, usage]);

  const tokensChartData = useMemo(() => {
    if (sqliteTokensTrend) {
      return buildTrendChartData(sqliteTokensTrend, chartLines);
    }
    if (!usage) return { labels: [], datasets: [] };
    return buildChartData(usage, tokensPeriod, 'tokens', chartLines, { hourWindowHours });
  }, [chartLines, hourWindowHours, sqliteTokensTrend, tokensPeriod, usage]);

  const requestsChartOptions = useMemo(
    () =>
      buildChartOptions({
        period: requestsPeriod,
        labels: requestsChartData.labels,
        isDark,
        isMobile
      }),
    [requestsPeriod, requestsChartData.labels, isDark, isMobile]
  );

  const tokensChartOptions = useMemo(
    () =>
      buildChartOptions({
        period: tokensPeriod,
        labels: tokensChartData.labels,
        isDark,
        isMobile
      }),
    [tokensPeriod, tokensChartData.labels, isDark, isMobile]
  );

  return {
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions
  };
}

function buildTrendChartData(
  trend: UsageMetricTrendPayload,
  chartLines: string[]
): ChartData {
  const labels = Array.isArray(trend?.labels)
    ? trend.labels.filter((label): label is string => typeof label === 'string')
    : [];
  const modelsToShow = chartLines.length > 0 ? chartLines : ['all'];
  const seriesMap = new Map<string, number[]>();
  (trend?.series ?? []).forEach((series) => {
    const modelName = typeof series?.model_name === 'string' ? series.model_name : '';
    if (!modelName) {
      return;
    }
    const values = Array.isArray(series.values)
      ? series.values.map((value) => (typeof value === 'number' ? value : Number(value) || 0))
      : new Array<number>(labels.length).fill(0);
    seriesMap.set(modelName, values);
  });

  return {
    labels,
    datasets: modelsToShow.map((model, index) => {
      const style = SQLITE_CHART_COLORS[index % SQLITE_CHART_COLORS.length];
      const values = seriesMap.get(model) ?? new Array<number>(labels.length).fill(0);
      const shouldFill = modelsToShow.length === 1 || (model === 'all' && modelsToShow.length > 1);
      return {
        label: model === 'all' ? 'All Models' : model,
        data: values,
        borderColor: style.borderColor,
        backgroundColor: style.backgroundColor,
        pointBackgroundColor: style.borderColor,
        pointBorderColor: style.borderColor,
        fill: shouldFill,
        tension: 0.35,
      };
    }),
  };
}

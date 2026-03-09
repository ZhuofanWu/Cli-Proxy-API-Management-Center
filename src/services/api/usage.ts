/**
 * 使用统计相关 API
 */

import { apiClient } from './client';
import { computeKeyStats, type KeyStats, type UsageTimeRange } from '@/utils/usage';

const USAGE_TIMEOUT_MS = 60 * 1000;

export interface UsageExportPayload {
  version?: number;
  exported_at?: string;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UsageImportResponse {
  added?: number;
  skipped?: number;
  total_requests?: number;
  failed_requests?: number;
  [key: string]: unknown;
}

export interface UsageGeneralPoint {
  ts: string;
  value: number;
}

export interface UsageGeneralSummary {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  rpm_30m?: number;
  rpm_request_count_30m?: number;
  tpm_30m?: number;
  tpm_token_count_30m?: number;
  total_cost?: number;
  cost_available?: boolean;
}

export interface UsageGeneralSeries {
  requests_60m?: UsageGeneralPoint[];
  tokens_60m?: UsageGeneralPoint[];
  rpm_30m?: UsageGeneralPoint[];
  tpm_30m?: UsageGeneralPoint[];
  cost_30m?: UsageGeneralPoint[];
}

export interface UsageGeneralPayload {
  summary?: UsageGeneralSummary;
  series?: UsageGeneralSeries;
}

export const usageApi = {
  /**
   * 获取使用统计原始数据
   */
  getUsage: (range: UsageTimeRange = 'all') =>
    apiClient.get<Record<string, unknown>>('/usage', {
      timeout: USAGE_TIMEOUT_MS,
      params: { range },
    }),

  getUsageGeneral: (range: UsageTimeRange = 'all') =>
    apiClient.get<UsageGeneralPayload>('/usage/general', {
      timeout: USAGE_TIMEOUT_MS,
      params: { range },
    }),

  getFullUsage: () =>
    apiClient.get<Record<string, unknown>>('/usage/full', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 导出使用统计快照
   */
  exportUsage: () =>
    apiClient.get<UsageExportPayload>('/usage/export', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 导入使用统计快照
   */
  importUsage: (payload: unknown) =>
    apiClient.post<UsageImportResponse>('/usage/import', payload, { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 计算密钥成功/失败统计，必要时会先获取 usage 数据
   */
  async getKeyStats(usageData?: unknown): Promise<KeyStats> {
    let payload = usageData;
    if (!payload) {
      const response = await apiClient.get<Record<string, unknown>>('/usage/full', {
        timeout: USAGE_TIMEOUT_MS,
      });
      payload = response?.usage ?? response;
    }
    return computeKeyStats(payload);
  },
};

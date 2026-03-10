import type {
  UsageCredentialHealthPayload,
  UsageCredentialItem,
} from '@/services/api/usage';
import {
  normalizeAuthIndex,
  normalizeUsageSourceId,
  type KeyStats,
  type StatusBarData,
  type StatusBlockDetail,
  type StatusBlockState,
} from '@/utils/usage';

const DEFAULT_BLOCK_COUNT = 20;
const DEFAULT_BUCKET_MINUTES = 15;

export interface CredentialUsageIndex {
  keyStats: KeyStats;
  sourceStatusMap: Map<string, StatusBarData>;
  authIndexStatusMap: Map<string, StatusBarData>;
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toInteger = (value: unknown): number => Math.max(0, Math.round(toNumber(value)));

const resolveBlockState = (
  success: number,
  failure: number,
  rate: number
): StatusBlockState => {
  if (success + failure === 0 && rate < 0) {
    return 'idle';
  }
  if (failure === 0 && (success > 0 || rate >= 1)) {
    return 'success';
  }
  if (success === 0 && (failure > 0 || rate === 0)) {
    return 'failure';
  }
  return 'mixed';
};

export function createEmptyCredentialStatusBarData(
  blockCount = DEFAULT_BLOCK_COUNT,
  bucketMinutes = DEFAULT_BUCKET_MINUTES
): StatusBarData {
  const durationMs = bucketMinutes * 60 * 1000;
  const windowStart = Date.now() - blockCount * durationMs;
  const blockDetails: StatusBlockDetail[] = Array.from({ length: blockCount }, (_, index) => {
    const startTime = windowStart + index * durationMs;
    return {
      success: 0,
      failure: 0,
      rate: -1,
      startTime,
      endTime: startTime + durationMs,
    };
  });

  return {
    blocks: Array.from({ length: blockCount }, () => 'idle' as StatusBlockState),
    blockDetails,
    successRate: 100,
    totalSuccess: 0,
    totalFailure: 0,
  };
}

export function buildStatusBarDataFromCredentialHealth(
  health?: UsageCredentialHealthPayload | null
): StatusBarData {
  if (!health) {
    return createEmptyCredentialStatusBarData();
  }

  const rates = Array.isArray(health.rates) ? health.rates : [];
  const successCounts = Array.isArray(health.success_counts) ? health.success_counts : [];
  const failureCounts = Array.isArray(health.failure_counts) ? health.failure_counts : [];
  const declaredCount = Math.max(
    0,
    toInteger(health.rows) * toInteger(health.cols)
  );
  const blockCount = Math.max(
    DEFAULT_BLOCK_COUNT,
    declaredCount,
    rates.length,
    successCounts.length,
    failureCounts.length
  );
  const bucketMinutes = Math.max(1, toInteger(health.bucket_minutes) || DEFAULT_BUCKET_MINUTES);
  const durationMs = bucketMinutes * 60 * 1000;
  const parsedWindowStart = Date.parse(String(health.window_start ?? ''));
  const windowStart = Number.isFinite(parsedWindowStart)
    ? parsedWindowStart
    : Date.now() - blockCount * durationMs;

  let totalSuccess = 0;
  let totalFailure = 0;
  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];

  for (let index = 0; index < blockCount; index += 1) {
    const success = toInteger(successCounts[index]);
    const failure = toInteger(failureCounts[index]);
    const total = success + failure;
    const rawRate = toOptionalNumber(rates[index]);
    const rate = total > 0 ? success / total : rawRate !== null && rawRate >= 0 ? rawRate / 100 : -1;
    const startTime = windowStart + index * durationMs;

    totalSuccess += success;
    totalFailure += failure;
    blocks.push(resolveBlockState(success, failure, rate));
    blockDetails.push({
      success,
      failure,
      rate,
      startTime,
      endTime: startTime + durationMs,
    });
  }

  const overallTotal = totalSuccess + totalFailure;
  const rawSuccessRate = toOptionalNumber(health.success_rate);
  const overallSuccessRate =
    overallTotal > 0 ? (totalSuccess / overallTotal) * 100 : rawSuccessRate ?? 100;

  return {
    blocks,
    blockDetails,
    successRate: overallSuccessRate,
    totalSuccess,
    totalFailure,
  };
}

export function mergeStatusBarData(items: Iterable<StatusBarData>): StatusBarData {
  const entries = Array.from(items);
  if (!entries.length) {
    return createEmptyCredentialStatusBarData();
  }

  const reference = entries.find((item) => item.blockDetails.length > 0);
  if (!reference) {
    return createEmptyCredentialStatusBarData();
  }

  const blockCount = Math.max(...entries.map((item) => item.blockDetails.length));
  const firstDetail = reference.blockDetails[0];
  const durationMs =
    firstDetail && firstDetail.endTime > firstDetail.startTime
      ? firstDetail.endTime - firstDetail.startTime
      : DEFAULT_BUCKET_MINUTES * 60 * 1000;
  const baseStart = firstDetail?.startTime ?? Date.now() - blockCount * durationMs;

  let totalSuccess = 0;
  let totalFailure = 0;
  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];

  for (let index = 0; index < blockCount; index += 1) {
    let success = 0;
    let failure = 0;
    entries.forEach((item) => {
      const detail = item.blockDetails[index];
      if (!detail) return;
      success += detail.success;
      failure += detail.failure;
    });

    const total = success + failure;
    const rate = total > 0 ? success / total : -1;
    const referenceDetail = reference.blockDetails[index];
    const startTime = referenceDetail?.startTime ?? baseStart + index * durationMs;
    const endTime = referenceDetail?.endTime ?? startTime + durationMs;

    totalSuccess += success;
    totalFailure += failure;
    blocks.push(resolveBlockState(success, failure, rate));
    blockDetails.push({
      success,
      failure,
      rate,
      startTime,
      endTime,
    });
  }

  const overallTotal = totalSuccess + totalFailure;
  return {
    blocks,
    blockDetails,
    successRate: overallTotal > 0 ? (totalSuccess / overallTotal) * 100 : 100,
    totalSuccess,
    totalFailure,
  };
}

const addBucket = (
  bucket: Record<string, { success: number; failure: number }>,
  key: string,
  success: number,
  failure: number
) => {
  if (!bucket[key]) {
    bucket[key] = { success: 0, failure: 0 };
  }
  bucket[key].success += success;
  bucket[key].failure += failure;
};

const appendStatusData = (
  map: Map<string, StatusBarData[]>,
  key: string,
  statusData: StatusBarData
) => {
  const current = map.get(key) ?? [];
  current.push(statusData);
  map.set(key, current);
};

export function buildCredentialUsageIndex(items: UsageCredentialItem[]): CredentialUsageIndex {
  const keyStats: KeyStats = { bySource: {}, byAuthIndex: {} };
  const sourceStatusParts = new Map<string, StatusBarData[]>();
  const authIndexStatusParts = new Map<string, StatusBarData[]>();

  items.forEach((item) => {
    const success = toInteger(item.success);
    const failure = toInteger(item.failure);
    const sourceKey = normalizeUsageSourceId(item.source);
    const authIndexKey = normalizeAuthIndex(item.auth_index);

    if (sourceKey) {
      addBucket(keyStats.bySource, sourceKey, success, failure);
    }
    if (authIndexKey) {
      addBucket(keyStats.byAuthIndex, authIndexKey, success, failure);
    }

    if (!item.health) {
      return;
    }

    const statusData = buildStatusBarDataFromCredentialHealth(item.health);
    if (sourceKey) {
      appendStatusData(sourceStatusParts, sourceKey, statusData);
    }
    if (authIndexKey) {
      appendStatusData(authIndexStatusParts, authIndexKey, statusData);
    }
  });

  const sourceStatusMap = new Map<string, StatusBarData>();
  sourceStatusParts.forEach((parts, key) => {
    sourceStatusMap.set(key, mergeStatusBarData(parts));
  });

  const authIndexStatusMap = new Map<string, StatusBarData>();
  authIndexStatusParts.forEach((parts, key) => {
    authIndexStatusMap.set(key, mergeStatusBarData(parts));
  });

  return {
    keyStats,
    sourceStatusMap,
    authIndexStatusMap,
  };
}

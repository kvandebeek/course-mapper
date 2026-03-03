/**
 * src/utils/throttle.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

import { Logger } from '../logger.js';

const DEFAULT_JITTER_RATIO = 0.15;
const DEFAULT_BACKOFF_BASE_MS = 150;
const DEFAULT_BACKOFF_MAX_MS = 2_000;
const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * sleepMs: public helper used by other modules.
 */
export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * sleepLogged: public helper used by other modules.
 */
export async function sleepLogged(
  ms: number,
  logger: Logger | undefined,
  reason: string,
  operationName?: string
): Promise<void> {
  const sleepMsClamped = Math.max(0, ms);
  /*logger?.info('Sleep scheduled', {
    reason,
    sleepMs: sleepMsClamped,
    ...(operationName ? { operationName } : {})
  });*/
  await sleepMs(sleepMsClamped);
}

/**
 * jitterMs: internal utility for this module.
 */
function jitterMs(baseMs: number, jitterRatio: number): number {
  const spread = Math.max(0, baseMs * Math.max(0, jitterRatio));
  const offset = (Math.random() * 2 - 1) * spread;
  return Math.max(0, Math.round(baseMs + offset));
}

export interface ThrottledOptions {
  readonly operationName: string;
  readonly throttleMs: number;
  readonly logger?: Logger;
  readonly maxAttempts?: number;
  readonly jitterRatio?: number;
  readonly backoffBaseMs?: number;
  readonly backoffMaxMs?: number;
}

interface RateLimitSignal {
  readonly detected: boolean;
  readonly type: string;
}

/**
 * classifyRateLimit: internal utility for this module.
 */
function classifyRateLimit(error: unknown): RateLimitSignal {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (status === 403 || status === 429) {
      return { detected: true, type: String(status) };
    }
  }

  const message = String(error).toLowerCase();
  if (message.includes('forbidden')) {
    return { detected: true, type: 'forbidden' };
  }
  if (message.includes('429')) {
    return { detected: true, type: '429' };
  }
  if (message.includes('rate limit')) {
    return { detected: true, type: 'rate limit' };
  }
  if (message.includes('access denied')) {
    return { detected: true, type: 'access denied' };
  }

  return { detected: false, type: 'unknown' };
}

/**
 * throttled<T>: public helper used by other modules.
 */
export async function throttled<T>(fn: () => Promise<T>, opts: ThrottledOptions): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const jitterRatio = opts.jitterRatio ?? DEFAULT_JITTER_RATIO;
  const backoffBaseMs = opts.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const backoffMaxMs = opts.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;

  let attempt = 1;
  while (attempt <= maxAttempts) {
    await sleepLogged(jitterMs(opts.throttleMs, jitterRatio), opts.logger, 'throttle', opts.operationName);

    try {
      return await fn();
    } catch (error) {
      const signal = classifyRateLimit(error);
      const isLast = attempt >= maxAttempts;
      if (!signal.detected || isLast) {
        throw error;
      }

      const expBackoff = Math.min(backoffBaseMs * 2 ** (attempt - 1), backoffMaxMs);
      const backoffMs = jitterMs(expBackoff, jitterRatio);
      opts.logger?.warn(
        `Rate limit detected (${signal.type}) during ${opts.operationName}, attempt ${attempt}/${maxAttempts}; backing off ${backoffMs}ms`
      );
      await sleepLogged(backoffMs, opts.logger, 'backoff', opts.operationName);
      attempt += 1;
    }
  }

  throw new Error(`Failed throttled operation: ${opts.operationName}`);
}

/**
 * src/logger.ts
 *
 * Purpose: documents the responsibilities of this module so new contributors can
 * quickly understand where it sits in the scraping pipeline.
 */

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

/**
 * createLogger: public helper used by other modules.
 */
export function createLogger(debugEnabled: boolean): Logger {
/**
 * log: internal utility for this module.
 */
  function log(level: string, message: string, data?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const payload = data ? ` ${JSON.stringify(data)}` : '';
    console.log(`${timestamp} [${level}] ${message}${payload}`);
  }

  return {
    info(message: string, data?: Record<string, unknown>): void {
      log('INFO', message, data);
    },
    warn(message: string, data?: Record<string, unknown>): void {
      log('WARN', message, data);
    },
    error(message: string, data?: Record<string, unknown>): void {
      log('ERROR', message, data);
    },
    debug(message: string, data?: Record<string, unknown>): void {
      if (debugEnabled) {
        log('DEBUG', message, data);
      }
    }
  };
}

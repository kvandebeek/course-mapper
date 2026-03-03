/**
 * Central structured logger used by the CLI and scraping modules.
 *
 * Responsibilities:
 * - Emit timestamped log lines in a stable text format.
 * - Keep debug noise opt-in while preserving INFO/WARN/ERROR by default.
 * - Accept optional structured metadata so rejection reasons and throttle events
 *   remain traceable in run logs.
 *
 * Invariants:
 * - Logging never throws on its own.
 * - Every message includes an ISO timestamp and level marker.
 */

/**
 * Minimal logger contract shared across modules.
 */
export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

/**
 * Creates a console-backed logger.
 */
export function createLogger(debugEnabled: boolean): Logger {
  /**
   * Writes a single structured log line.
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

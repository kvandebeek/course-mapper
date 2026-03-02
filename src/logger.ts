export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

export function createLogger(debugEnabled: boolean): Logger {
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

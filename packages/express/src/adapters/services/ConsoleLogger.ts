import { ILogger, LogLevel, LogContext } from '../../core/ports/ILogger.js';

/**
 * Console Logger for Node.js/Express
 * Uses console methods with structured JSON logging
 */
export class ConsoleLogger implements ILogger {
  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(
    private readonly minLevel: LogLevel = 'info',
    private readonly prefix: string = '[API]'
  ) {}

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.minLevel];
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext): object {
    return {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      prefix: this.prefix,
      message,
      ...(context && { context }),
    };
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      console.debug(JSON.stringify(this.formatLog('debug', message, context)));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      console.info(JSON.stringify(this.formatLog('info', message, context)));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      console.warn(JSON.stringify(this.formatLog('warn', message, context)));
    }
  }

  error(message: string, context?: LogContext): void {
    if (this.shouldLog('error')) {
      console.error(JSON.stringify(this.formatLog('error', message, context)));
    }
  }
}

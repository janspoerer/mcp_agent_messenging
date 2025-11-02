/**
 * Structured logging utility for production monitoring
 * Provides JSON-formatted logs with timestamps and context
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
  duration?: number;
}

/**
 * Structured logger with JSON output
 */
export class Logger {
  private component: string;
  private enableConsole: boolean;

  constructor(component: string, enableConsole: boolean = true) {
    this.component = component;
    this.enableConsole = enableConsole;
  }

  /**
   * Logs a debug message
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Logs an info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Logs a warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Logs an error message
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.log('error', message, data);
  }

  /**
   * Times an async operation and logs it
   */
  async timeAsync<T>(
    message: string,
    fn: () => Promise<T>,
    data?: Record<string, unknown>
  ): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.logWithDuration('info', message, duration, data);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logWithDuration(
        'error',
        `${message} (failed)`,
        duration,
        {
          ...data,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      throw error;
    }
  }

  /**
   * Times a sync operation and logs it
   */
  timeSync<T>(
    message: string,
    fn: () => T,
    data?: Record<string, unknown>
  ): T {
    const startTime = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - startTime;
      this.logWithDuration('info', message, duration, data);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logWithDuration(
        'error',
        `${message} (failed)`,
        duration,
        {
          ...data,
          error: error instanceof Error ? error.message : String(error),
        }
      );
      throw error;
    }
  }

  /**
   * Internal logging method
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      ...(data && { data }),
    };

    if (this.enableConsole) {
      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.component}]`;
      const args: (string | Record<string, unknown>)[] = [prefix, entry.message];
      if (data) {
        args.push(data);
      }

      switch (level) {
        case 'debug':
          console.log(...args);
          break;
        case 'info':
          console.log(...args);
          break;
        case 'warn':
          console.warn(...args);
          break;
        case 'error':
          console.error(...args);
          break;
      }
    }
  }

  /**
   * Internal logging with duration
   */
  private logWithDuration(
    level: LogLevel,
    message: string,
    duration: number,
    data?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      duration,
      ...(data && { data }),
    };

    if (this.enableConsole) {
      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${this.component}] (+${duration}ms)`;
      const args: (string | Record<string, unknown>)[] = [prefix, entry.message];
      if (data) {
        args.push(data);
      }

      switch (level) {
        case 'info':
          console.log(...args);
          break;
        case 'error':
          console.error(...args);
          break;
      }
    }
  }
}

/**
 * Create a logger for a specific component
 */
export function createLogger(component: string): Logger {
  return new Logger(component);
}

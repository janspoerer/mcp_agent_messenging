/**
 * Simple async lock/mutex implementation for preventing race conditions
 */

interface QueuedTask {
  resolve: () => void;
}

/**
 * Async lock for synchronizing critical sections
 */
export class AsyncLock {
  private locked: boolean = false;
  private queue: QueuedTask[] = [];

  /**
   * Acquires the lock
   * @returns Promise that resolves when the lock is acquired
   */
  async acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve(() => this.release());
      } else {
        this.queue.push({
          resolve: () => resolve(() => this.release()),
        });
      }
    });
  }

  /**
   * Releases the lock and processes the next queued task
   */
  private release(): void {
    const next = this.queue.shift();
    if (next) {
      next.resolve();
    } else {
      this.locked = false;
    }
  }

  /**
   * Executes a function while holding the lock
   * @param fn The function to execute
   * @returns The result of the function
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

/**
 * Manages multiple named locks for different resources
 */
export class LockManager {
  private locks: Map<string, AsyncLock> = new Map();

  /**
   * Gets or creates a lock for a specific key
   * @param key The lock identifier
   * @returns The lock for this key
   */
  getLock(key: string): AsyncLock {
    let lock = this.locks.get(key);
    if (!lock) {
      lock = new AsyncLock();
      this.locks.set(key, lock);
    }
    return lock;
  }

  /**
   * Executes a function while holding a named lock
   * @param key The lock identifier
   * @param fn The function to execute
   * @returns The result of the function
   */
  async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const lock = this.getLock(key);
    return lock.runExclusive(fn);
  }
}

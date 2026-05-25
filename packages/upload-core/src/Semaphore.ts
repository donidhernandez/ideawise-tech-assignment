/**
 * Lightweight async semaphore used to cap concurrent chunk uploads.
 *
 * Permits are handed out atomically inside drain() to avoid races where
 * two acquirers see `available > 0` after a single release().
 *
 * Pausing freezes drainage without losing queued acquirers; resume()
 * picks up exactly where pause() left off.
 */
export class Semaphore {
  private available: number;
  private readonly queue: Array<() => void> = [];
  private paused = false;

  constructor(public readonly capacity: number) {
    if (capacity <= 0) throw new Error('Semaphore capacity must be > 0');
    this.available = capacity;
  }

  async acquire(): Promise<void> {
    if (!this.paused && this.available > 0) {
      this.available--;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    // Permit was already deducted by drain() before it resolved us.
  }

  release(): void {
    this.available++;
    this.drain();
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.drain();
  }

  private drain(): void {
    while (!this.paused && this.available > 0 && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) break;
      this.available--;
      next();
    }
  }

  /** Test-only introspection. */
  get pendingCount(): number {
    return this.queue.length;
  }

  /** Test-only introspection. */
  get availablePermits(): number {
    return this.available;
  }

  get isPaused(): boolean {
    return this.paused;
  }
}

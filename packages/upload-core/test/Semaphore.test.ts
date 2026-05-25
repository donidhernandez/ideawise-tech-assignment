import { describe, expect, it } from 'vitest';
import { Semaphore } from '../src/Semaphore.js';

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe('Semaphore', () => {
  it('allows up to N concurrent acquirers', async () => {
    const sem = new Semaphore(3);
    await sem.acquire();
    await sem.acquire();
    await sem.acquire();
    expect(sem.availablePermits).toBe(0);

    let fourthAcquired = false;
    const fourth = sem.acquire().then(() => {
      fourthAcquired = true;
    });

    await tick();
    expect(fourthAcquired).toBe(false);
    expect(sem.pendingCount).toBe(1);

    sem.release();
    await fourth;
    expect(fourthAcquired).toBe(true);
  });

  it('caps concurrency under heavy load', async () => {
    const sem = new Semaphore(3);
    let active = 0;
    let peak = 0;

    async function worker(): Promise<void> {
      await sem.acquire();
      active++;
      peak = Math.max(peak, active);
      await tick();
      active--;
      sem.release();
    }

    await Promise.all(Array.from({ length: 20 }, () => worker()));
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('pause prevents new acquires from being served', async () => {
    const sem = new Semaphore(2);
    sem.pause();

    let acquired = 0;
    const p1 = sem.acquire().then(() => acquired++);
    const p2 = sem.acquire().then(() => acquired++);

    await tick();
    expect(acquired).toBe(0);

    sem.resume();
    await Promise.all([p1, p2]);
    expect(acquired).toBe(2);
  });

  it('resume drains queue in FIFO order', async () => {
    const sem = new Semaphore(1);
    await sem.acquire(); // exhaust the single permit
    sem.pause();

    const order: number[] = [];
    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));
    const p3 = sem.acquire().then(() => order.push(3));

    sem.resume();
    sem.release();
    await p1;
    sem.release();
    await p2;
    sem.release();
    await p3;
    expect(order).toEqual([1, 2, 3]);
  });
});

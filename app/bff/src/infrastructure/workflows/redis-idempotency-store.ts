import { Redis } from 'ioredis';
import type { IIdempotencyStore } from '../../domain/ports/workflows.js';

export class RedisIdempotencyStore implements IIdempotencyStore {
  constructor(private readonly redis: Redis) {}

  private key(key: string) {
    return `webhook:idempotency:${key}`;
  }

  async claim(key: string, ttlMs: number): Promise<boolean> {
    const res = await this.redis.set(this.key(key), '1', 'PX', ttlMs, 'NX');
    return res === 'OK';
  }

  async release(key: string): Promise<void> {
    await this.redis.del(this.key(key));
  }
}

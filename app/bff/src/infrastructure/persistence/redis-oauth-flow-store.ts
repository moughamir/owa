import { Redis } from 'ioredis';
import type { IOAuthFlowStore, OAuthPendingCode, OAuthPendingRequest } from '../../domain/ports/oauth.js';

const REQUEST_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class RedisOAuthFlowStore implements IOAuthFlowStore {
  constructor(private readonly redis: Redis) {}

  private reqKey(id: string) {
    return `oauth:flow:req:${id}`;
  }

  private codeKey(hash: string) {
    return `oauth:flow:code:${hash}`;
  }

  async putRequest(id: string, request: OAuthPendingRequest): Promise<void> {
    await this.redis.set(this.reqKey(id), JSON.stringify(request), 'PX', REQUEST_TTL_MS);
  }

  async getRequest(id: string): Promise<OAuthPendingRequest | null> {
    const raw = await this.redis.get(this.reqKey(id));
    if (!raw) return null;
    const req = JSON.parse(raw) as OAuthPendingRequest;
    if (req.expiresAt < Date.now()) {
      await this.redis.del(this.reqKey(id));
      return null;
    }
    return req;
  }

  async deleteRequest(id: string): Promise<void> {
    await this.redis.del(this.reqKey(id));
  }

  async putCode(hash: string, code: OAuthPendingCode): Promise<void> {
    await this.redis.set(this.codeKey(hash), JSON.stringify(code), 'PX', CODE_TTL_MS);
  }

  async takeCode(hash: string): Promise<OAuthPendingCode | null> {
    const raw = await this.redis.get(this.codeKey(hash));
    if (!raw) return null;
    const code = JSON.parse(raw) as OAuthPendingCode;
    await this.redis.del(this.codeKey(hash));
    if (code.expiresAt < Date.now()) return null;
    return code;
  }

  sweep(_now?: number): void {
    // Redis handles TTL natively; no-op.
  }
}

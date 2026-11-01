import type { IOAuthFlowStore, OAuthPendingCode, OAuthPendingRequest } from '../../domain/ports/oauth.js';

/** Short-lived flow state. In memory: a BFF restart only cancels in-flight sign-ins. */
export class FlowStore implements IOAuthFlowStore {
  readonly requests = new Map<string, OAuthPendingRequest>();
  readonly codes = new Map<string, OAuthPendingCode>();

  async putRequest(id: string, request: OAuthPendingRequest): Promise<void> {
    this.requests.set(id, request);
  }

  async getRequest(id: string): Promise<OAuthPendingRequest | null> {
    const v = this.requests.get(id);
    if (!v) return null;
    if (v.expiresAt < Date.now()) {
      this.requests.delete(id);
      return null;
    }
    return v;
  }

  async deleteRequest(id: string): Promise<void> {
    this.requests.delete(id);
  }

  async putCode(hash: string, code: OAuthPendingCode): Promise<void> {
    this.codes.set(hash, code);
  }

  async takeCode(hash: string): Promise<OAuthPendingCode | null> {
    const v = this.codes.get(hash);
    if (!v) return null;
    if (v.expiresAt < Date.now()) {
      this.codes.delete(hash);
      return null;
    }
    this.codes.delete(hash);
    return v;
  }

  sweep(now = Date.now()): void {
    for (const [k, v] of this.requests) if (v.expiresAt < now) this.requests.delete(k);
    for (const [k, v] of this.codes) if (v.expiresAt < now) this.codes.delete(k);
  }
}

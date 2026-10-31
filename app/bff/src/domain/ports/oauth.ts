/**
 * OAuth 2.1 authorization server state for MCP connectors (Claude).
 *
 * A *grant* is one approved connection: one user, one registered client, one OpenWA key scoped
 * to the user's own session (stored encrypted; the BFF must present it to the engine).
 * Access and refresh tokens are opaque and stored only as SHA-256 hashes.
 */

export interface OAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  createdAt: Date;
}

export interface OAuthGrantView {
  id: string;
  clientId: string;
  clientName: string;
  scope: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface NewOAuthGrant {
  id: string;
  userId: string;
  clientId: string;
  openwaKeyId: string;
  /** AES-256-GCM sealed OpenWA key. */
  openwaKeyEnc: string;
  scope: string;
}

export type OAuthTokenKind = 'access' | 'refresh';

/** A token resolved to an active grant, with what the MCP passthrough needs. */
export interface ResolvedToken {
  grantId: string;
  clientId: string;
  userId: string;
  kind: OAuthTokenKind;
  expiresAt: Date;
  /** Set once a refresh token has been exchanged (rotation); a second use means theft. */
  usedAt: Date | null;
  openwaKeyEnc: string;
  openwaSessionId: string;
  scope: string;
}

export interface IOAuthRepository {
  createClient(client: Omit<OAuthClient, 'createdAt'>): Promise<void>;
  getClient(clientId: string): Promise<OAuthClient | null>;

  createGrant(grant: NewOAuthGrant): Promise<void>;
  listGrants(userId: string): Promise<OAuthGrantView[]>;
  /**
   * Revoke a grant and its tokens. With `userId`, only that user's grant. Returns the OpenWA key
   * id to revoke at the engine, or null when nothing active matched.
   */
  revokeGrant(grantId: string, userId?: string): Promise<string | null>;
  /** OpenWA key ids of the user's active grants (for session deletion). */
  activeGrantKeyIds(userId: string): Promise<string[]>;

  addToken(token: { hash: string; grantId: string; kind: OAuthTokenKind; expiresAt: Date }): Promise<void>;
  /** Token by hash, only while its grant is active and the user still has a session. */
  findToken(hash: string): Promise<ResolvedToken | null>;
  /** Atomically mark a refresh token used. False if it was already used. */
  markRefreshUsed(hash: string): Promise<boolean>;
  touchGrant(grantId: string): Promise<void>;
}

/** Flow state parked between /oauth/authorize and the token exchange (short-lived). */
export interface OAuthPendingRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  state: string | undefined;
  codeChallenge: string;
  scope: string;
  expiresAt: number;
}

export interface OAuthPendingCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  userId: string;
  scope: string;
  expiresAt: number;
}

/**
 * Short-lived OAuth flow state: one `/oauth/authorize` request plus its one-time code.
 * Implementations own expiry — an entry must not be readable after its `expiresAt`,
 * and codes are single-use (`takeCode` reads and deletes atomically).
 */
export interface IOAuthFlowStore {
  putRequest(id: string, request: OAuthPendingRequest): Promise<void>;
  getRequest(id: string): Promise<OAuthPendingRequest | null>;
  deleteRequest(id: string): Promise<void>;
  putCode(hash: string, code: OAuthPendingCode): Promise<void>;
  /** Atomic single-use read: returns the code and removes it, or null. */
  takeCode(hash: string): Promise<OAuthPendingCode | null>;
  /** Best-effort expired-entry cleanup; a no-op for stores with native TTLs. */
  sweep(now?: number): void;
}

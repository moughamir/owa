import { describe, expect, it } from 'bun:test';
import { WorkflowEngine } from './engine.js';
import type {
  IContactAllowlist,
  IReplySender,
  ITenantDirectory,
  IWorkflowStore,
  InboundMessage,
} from '../ports/index.js';

const baseMsg: InboundMessage = {
  sessionId: 'sess-1',
  chatId: '212600000000@c.us',
  body: 'hello',
  type: 'text',
  fromMe: false,
  isGroup: false,
  isStatusBroadcast: false,
};

function makeEngine(opts: {
  tenant?: string | null;
  allowed?: boolean;
  settings?: { rules: Record<string, boolean> };
  claimCooldown?: boolean;
}) {
  const directory: ITenantDirectory = { tenantForSession: async () => (opts.tenant === undefined ? 'tenant-1' : opts.tenant) };
  const allowlist: IContactAllowlist = { isAllowed: async () => opts.allowed ?? true };
  const store: IWorkflowStore = {
    getSettings: async () => opts.settings ?? { rules: { 'ping-pong': true, greeting: true } },
    setRuleEnabled: async () => ({ rules: { 'ping-pong': true, greeting: true } }),
    claimCooldown: async () => opts.claimCooldown ?? true,
    releaseCooldown: async () => {},
  };
  const sender: IReplySender = { send: async () => 'sent' };
  return new WorkflowEngine(directory, allowlist, store, sender);
}

describe('WorkflowEngine', () => {
  it('ignores fromMe messages', async () => {
    const engine = makeEngine({});
    const d = await engine.handle({ ...baseMsg, fromMe: true });
    expect(d.status).toBe('ignored');
    if (d.status === 'ignored') expect(d.reason).toBe('from_me');
  });

  it('ignores group messages', async () => {
    const engine = makeEngine({});
    const d = await engine.handle({ ...baseMsg, isGroup: true });
    expect(d.status).toBe('ignored');
    if (d.status === 'ignored') expect(d.reason).toBe('not_direct_chat');
  });

  it('ignores poll messages', async () => {
    const engine = makeEngine({});
    const d = await engine.handle({ ...baseMsg, type: 'poll', body: 'Where?' });
    expect(d.status).toBe('ignored');
    if (d.status === 'ignored') expect(d.reason).toBe('poll');
  });

  it('ignores non-text messages', async () => {
    const engine = makeEngine({});
    const d = await engine.handle({ ...baseMsg, type: 'image' });
    expect(d.status).toBe('ignored');
    if (d.status === 'ignored') expect(d.reason).toBe('not_text');
  });

  it('ignores unknown sessions', async () => {
    const engine = makeEngine({ tenant: null });
    const d = await engine.handle(baseMsg);
    expect(d.status).toBe('ignored');
    if (d.status === 'ignored') expect(d.reason).toBe('unknown_session');
  });

  it('ignores non-allowlisted contacts', async () => {
    const engine = makeEngine({ allowed: false });
    const d = await engine.handle(baseMsg);
    expect(d.status).toBe('ignored');
    if (d.status === 'ignored') expect(d.reason).toBe('not_allowlisted');
  });

  it('ignores messages with no matching rule', async () => {
    const engine = makeEngine({});
    const d = await engine.handle({ ...baseMsg, body: 'random gibberish xyz' });
    expect(d.status).toBe('ignored');
    if (d.status === 'ignored') expect(d.reason).toBe('no_match');
  });

  it('ignores when rule is disabled', async () => {
    const engine = makeEngine({ settings: { rules: { 'ping-pong': false, greeting: false } } });
    const d = await engine.handle({ ...baseMsg, body: 'ping' });
    expect(d.status).toBe('ignored');
    if (d.status === 'ignored') expect(d.reason).toBe('rule_disabled');
  });
});

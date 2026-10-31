import { contentType, renderOgSafe, size } from '@/lib/og';
import { siteHostname } from '@/lib/site';

export const runtime = 'nodejs';
export const alt = 'WaFine — WhatsApp gateway for teams.';
export { size, contentType };

// Copy fixed with the owner (owner-defaults v2, hero H1 + subhead).
const HERO_H1 = 'WaFine — WhatsApp gateway for teams.';
const HERO_SUBHEAD =
  'Connect your number, build paced auto-reply workflows, and plug it into Claude and your apps through one REST API and MCP. Invite-only. Built in Morocco.';

export default async function Image() {
  return renderOgSafe({
    title: HERO_H1,
    subtitle: HERO_SUBHEAD,
    badge: 'Open-core · Built on OpenWA',
    host: siteHostname(),
  });
}

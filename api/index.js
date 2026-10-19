import { registry } from '../src/tools/index.js';
import { PRODUCT_DISPLAY_NAME, PRODUCT_ATTRIBUTION } from '../src/core/product-identity.js';
import { profileToolCounts } from '../src/core/profiles.js';
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ name: PRODUCT_DISPLAY_NAME, description: PRODUCT_ATTRIBUTION, status: 'service-information',
    tools: registry.tools.length, profiles: profileToolCounts(registry.tools,
      {productionDeployment:process.env.VERCEL_ENV==='production'}), oauth: '/.well-known/oauth-authorization-server',
    endpoint: '/api/mcp', note: 'Connect with OAuth and verify a scoped tool call; metadata does not prove a working account connection.' });
}

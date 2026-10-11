import { registry } from '../src/tools/index.js';
import { profileToolCounts } from '../src/core/profiles.js';
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ name: 'Robinson Neon MCP', status: 'setup-required',
    tools: registry.tools.length, profiles: profileToolCounts(registry.tools,
      {productionDeployment:process.env.VERCEL_ENV==='production'}), oauth: '/.well-known/oauth-authorization-server',
    endpoint: '/api/mcp', note: 'Add your Neon keys through the secure setup page after A-5 is deployed.' });
}

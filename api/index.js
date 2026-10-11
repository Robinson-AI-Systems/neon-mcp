import { registry } from '../src/tools/index.js';
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ name: 'Robinson Neon MCP', status: 'setup-required',
    tools: registry.tools.length, oauth: '/.well-known/oauth-authorization-server',
    endpoint: '/api/mcp', note: 'Add your Neon keys through the secure setup page after A-5 is deployed.' });
}

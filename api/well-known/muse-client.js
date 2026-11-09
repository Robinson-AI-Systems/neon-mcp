// The Muse client document (RAS MCP Standard, Muse connection design MC-1).
// Storeless: built from the configured public origin, no database needed.
import { museClientDocument } from '../../src/core/muse-client.js';
import { send } from '../../src/core/http.js';

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  let doc;
  try { doc = museClientDocument(); } catch {
    return send(res, 503, { error: 'temporarily_unavailable', error_description: 'Public origin is not configured' });
  }
  return send(res, 200, doc);
}

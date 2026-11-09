// RAS MCP Standard — Muse connection design (MC-1, MC-2).
//
// Muse (Meta's assistant) connects with a Client ID the person types or
// pastes. This server publishes Muse's client document at
// /.well-known/muse-client.json, and the document's client_id is that same
// address, so "the Client ID is this server's Muse document address" works
// everywhere in the fleet.
//
// The server answers its OWN document locally (MC-2): it never fetches its
// own public address (the hairpin law) and never depends on a database row
// that a registration cleanup could remove. Visiting client documents from
// other hosts still go through the fetch-and-validate resolver (cimd.js).
import { publicOrigin } from './http.js';

export const MUSE_CLIENT_PATH = '/.well-known/muse-client.json';
export const MUSE_REDIRECT_URI = 'https://agent.meta.ai/api/hatch/oauth/callback';

export function museClientDocument(env = process.env) {
  return {
    client_id: publicOrigin(env) + MUSE_CLIENT_PATH,
    client_name: 'Muse',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: [MUSE_REDIRECT_URI],
    response_types: ['code'],
    token_endpoint_auth_method: 'none'
  };
}

// The built-in public client for this server's own Muse document, shaped
// like a validated card client, or null for any other client_id.
export function ownMuseClient(clientId, env = process.env) {
  if (typeof clientId !== 'string' || !clientId.startsWith('https://')) return null;
  let doc;
  try { doc = museClientDocument(env); } catch { return null; }
  if (clientId !== doc.client_id) return null;
  return Object.freeze({
    client_id: doc.client_id,
    client_name: doc.client_name,
    redirect_uris: Object.freeze([...doc.redirect_uris]),
    token_endpoint_auth_method: 'none',
    client_secret_hash: null,
    cimd: true
  });
}

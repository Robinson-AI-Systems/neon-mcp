#!/usr/bin/env node
// Development Rack entrypoint (RACK-2): the thin standalone HTTP server
// that runs this service outside Vercel. It reproduces, route for
// route, the platform contract the api/ functions are written against:
//
//   - filesystem binding: every api/**/*.js default export serves at
//     its /api/* path, exactly as Vercel binds function files;
//   - the vercel.json rewrites, verbatim: /connection, the two
//     /.well-known OAuth documents, and the RTC doors /api/tools,
//     /api/tools/:name, /api/whoami, /api/results/:handle (rewrite-
//     injected query parameters win over the request's own, as on
//     Vercel);
//   - the (req, res) surface the handlers use: req.method / headers /
//     query / body (parsed per each function's exported bodyParser
//     config, with Vercel's default 4.5 MB limit when a function does
//     not set one) and the chainable res.status / res.json / res.send
//     helpers on a real Node ServerResponse, so the MCP handler's
//     streaming transport keeps working untouched.
//
// No application logic lives here; every request is dispatched to the
// same handler module Vercel invokes. Q-1 (open, recorded on the card):
// in source, api/index.js is the front door and Vercel binds it at
// /api; whether the current live build also answers / is settled by a
// live read-back, not from source. This entrypoint serves the front
// door at BOTH / and /api so the rack hostname's root is never a 404;
// the route-table test pins both bindings so the Q-1 answer, when it
// lands, changes exactly one line either way.
import { createServer } from 'node:http';

import connectHandoff from './api/connect/handoff.js';
import connectionPage from './api/connection.js';
import contract from './api/contract.js';
import developerConnect from './api/developer/connect.js';
import health from './api/health.js';
import frontDoor from './api/index.js';
import mcp, { config as mcpConfig } from './api/mcp.js';
import setup from './api/neon/setup.js';
import oauthAuthorize from './api/oauth/authorize.js';
import oauthRegister from './api/oauth/register.js';
import oauthRevoke from './api/oauth/revoke.js';
import oauthToken from './api/oauth/token.js';
import openapi from './api/openapi.json.js';
import rtc, { config as rtcConfig } from './api/rtc.js';
import wellKnownAS from './api/well-known/oauth-authorization-server.js';
import wellKnownPR from './api/well-known/oauth-protected-resource.js';

// Only api/mcp.js and api/rtc.js export a bodyParser config today; the
// other functions ride Vercel's defaults, so their routes carry no
// config here.
const route = (handler, config) => Object.freeze({ handler, config });

export const FILE_ROUTES = new Map([
  ['/api/connect/handoff', route(connectHandoff)],
  ['/api/connection', route(connectionPage)],
  ['/api/contract', route(contract)],
  ['/api/developer/connect', route(developerConnect)],
  ['/api/health', route(health)],
  ['/api/index', route(frontDoor)],
  ['/api', route(frontDoor)],
  ['/api/mcp', route(mcp, mcpConfig)],
  ['/api/neon/setup', route(setup)],
  ['/api/oauth/authorize', route(oauthAuthorize)],
  ['/api/oauth/register', route(oauthRegister)],
  ['/api/oauth/revoke', route(oauthRevoke)],
  ['/api/oauth/token', route(oauthToken)],
  ['/api/openapi.json', route(openapi)],
  ['/api/rtc', route(rtc, rtcConfig)],
  ['/api/well-known/oauth-authorization-server', route(wellKnownAS)],
  ['/api/well-known/oauth-protected-resource', route(wellKnownPR)],
]);

const REWRITE_ROUTES = new Map([
  ['/connection', route(connectionPage)],
  ['/.well-known/oauth-authorization-server', route(wellKnownAS)],
  ['/.well-known/oauth-protected-resource', route(wellKnownPR)],
]);

// Resolves a request path to {handler, config, query} — query carries
// the rewrite-injected parameters for the RTC doors — or null (404).
export function resolveRoute(pathname) {
  if (pathname === '/') return { ...route(frontDoor), query: {} }; // Q-1: see header
  const rewritten = REWRITE_ROUTES.get(pathname);
  if (rewritten) return { ...rewritten, query: {} };
  if (pathname === '/api/tools') return { ...route(rtc, rtcConfig), query: { door: 'tools' } };
  if (pathname === '/api/whoami') return { ...route(rtc, rtcConfig), query: { door: 'whoami' } };
  let match = /^\/api\/tools\/([^/]+)$/.exec(pathname);
  if (match) return { ...route(rtc, rtcConfig), query: { door: 'tools', name: decodeURIComponent(match[1]) } };
  match = /^\/api\/results\/([^/]+)$/.exec(pathname);
  if (match) return { ...route(rtc, rtcConfig), query: { door: 'results', handle: decodeURIComponent(match[1]) } };
  const file = FILE_ROUTES.get(pathname);
  if (file) return { ...file, query: {} };
  return null;
}

const DEFAULT_BODY_LIMIT = 4_572_800; // Vercel's function body limit when a function sets none (4.5 MB)

export function bodyLimitBytes(config) {
  const parser = config?.api?.bodyParser;
  if (parser === false) return 0;
  const declared = typeof parser === 'object' && parser !== null ? parser.sizeLimit : undefined;
  if (declared === undefined) return DEFAULT_BODY_LIMIT;
  if (typeof declared === 'number') return declared;
  const parsed = /^(\d+(?:\.\d+)?)\s*(b|kb|mb)$/i.exec(String(declared).trim());
  if (!parsed) return DEFAULT_BODY_LIMIT;
  const factor = { b: 1, kb: 1024, mb: 1024 * 1024 }[parsed[2].toLowerCase()];
  return Math.floor(Number(parsed[1]) * factor);
}

function queryObject(searchParams) {
  const query = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }
  return query;
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Reproduces Vercel's bodyParser: JSON and form bodies arrive as
// objects, anything else as a string, no body as undefined. A JSON
// parse failure is the platform's 400, answered before the handler.
function parseBody(raw, contentType) {
  if (raw.length === 0) return undefined;
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  const text = raw.toString('utf8');
  if (type === 'application/json') {
    try {
      return JSON.parse(text);
    } catch {
      const error = new Error('Invalid JSON body');
      error.statusCode = 400;
      throw error;
    }
  }
  if (type === 'application/x-www-form-urlencoded') return queryObject(new URLSearchParams(text));
  return text;
}

function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (value) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
    return res;
  };
  res.send = (body) => {
    if (body === undefined || body === null) {
      res.end();
      return res;
    }
    if (typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body);
    if (typeof body === 'string' && !res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    res.end(body);
    return res;
  };
  return res;
}

function platformError(res, statusCode, error) {
  if (res.headersSent) return;
  res.setHeader('Cache-Control', 'no-store');
  res.status(statusCode).json({ error, error_description: statusCode === 413
    ? 'The request body exceeds this function\'s configured limit.'
    : 'The request body could not be parsed as JSON.' });
}

export function createRackServer() {
  return createServer(async (req, res) => {
    decorateResponse(res);
    try {
      const url = new URL(req.url, 'http://rack.internal');
      const resolved = resolveRoute(url.pathname);
      if (!resolved) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).json({ error: 'not_found' });
      }
      req.query = { ...queryObject(url.searchParams), ...resolved.query };
      const limit = bodyLimitBytes(resolved.config);
      if (limit > 0 && req.method !== 'GET' && req.method !== 'HEAD') {
        const raw = await readBody(req, limit);
        req.body = parseBody(raw, req.headers['content-type']);
      }
      return await resolved.handler(req, res);
    } catch (error) {
      if (error?.statusCode === 400 || error?.statusCode === 413) {
        return platformError(res, error.statusCode, error.statusCode === 413 ? 'payload_too_large' : 'invalid_json');
      }
      if (!res.headersSent) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(500).json({ error: 'internal_error' });
      }
      res.end();
    }
  });
}

if (process.argv[1]?.endsWith('rack-server.mjs')) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  createRackServer().listen(port, host, () => {
    console.log(`Neon Unleashed rack entrypoint listening on ${host}:${port}`);
  });
}

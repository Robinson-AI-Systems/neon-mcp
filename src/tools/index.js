import { mergeNamespaces } from '../core/registry.js';
import * as server from './server.js';
import * as ownerProduction from './owner-production.js';
export const registry=mergeNamespaces([server,ownerProduction]);

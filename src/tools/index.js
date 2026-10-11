import { mergeNamespaces } from '../core/registry.js';
import * as server from './server.js';
import * as ownerProduction from './owner-production.js';
import * as ownerReads from './owner-reads.js';
import * as keyAccess from './key-access.js';
import * as ownerAdministration from './owner-administration.js';
export const registry=mergeNamespaces([server,ownerProduction,ownerReads,ownerAdministration,keyAccess]);

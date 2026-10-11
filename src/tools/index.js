import { mergeNamespaces } from '../core/registry.js';
import * as server from './server.js';
export const registry=mergeNamespaces([server]);

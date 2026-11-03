// Legacy public OAuth callback for existing registered clients only.
// This URL is NOT a developer-only login or test-grant creation endpoint.
import {createHandoffEndpoint} from '../../src/developer/handoff-route.js';
export default createHandoffEndpoint({callbackPath:'/api/developer/connect',
  errorCode:'developer_connection_unavailable'});

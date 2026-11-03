// Standard customer mobile OAuth code handoff, separate from internal testing.
import {createHandoffEndpoint} from '../../src/developer/handoff-route.js';
export default createHandoffEndpoint({callbackPath:'/api/connect/handoff'});

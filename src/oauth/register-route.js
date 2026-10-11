// Copied and adapted from Robinson-AI-Systems/stripe-mcp src/oauth/register-route.js @ e2f90e8
import { handleOAuth } from './routes.js';
export default (req, res) => handleOAuth('register', req, res);

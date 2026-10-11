// Dashboard-only operations are instructions, never API mutations.
const url='https://console.neon.tech';
const guide=(setting,target,action,expected,verifyWith=null)=>({setting,url,
  steps:[{n:1,action:'Open the Neon Console and select the intended organization or project',target:'Console'},
    {n:2,action,target}],expected,verifyWith});
export const DASHBOARD_SETTINGS=Object.freeze({
  plan:guide('plan','Organization / Billing / Plan','Review plan choices and costs before changing anything.',
    'Billing page shows the chosen plan','neon_billing_usage'),
  payment_method:guide('payment_method','Organization / Billing / Payment methods',
    'Update your payment method in the secure billing page.','Billing page shows the new payment method'),
  sso:guide('sso','Organization settings / SSO','Review single sign-on and identity-provider access before saving.',
    'SSO settings show the intended configuration'),
  two_step_login:guide('two_step_login','Account settings / Security',
    'Enable two-step login in your account security settings.','Security page confirms two-step login'),
  integrations:guide('integrations','Project / Integrations',
    'Select an integration and review its permissions and costs before connecting.',
    'Integration status shows connected','neon_project_overview'),
  vercel_preview_branches:guide('vercel_preview_branches','Vercel / Storage / Neon integration',
    'Review preview branching options and existing shared-preview safeguards.',
    'Preview environment uses the intended Neon branch','neon_branch_list'),
  vercel_env_vars:guide('vercel_env_vars','Vercel Project / Settings / Environment Variables',
    'Set pooled DATABASE_URL and direct DIRECT_URL for each intended environment using secure entry.',
    'Environment variables are configured without displaying secrets','neon_connection_get_info'),
  branch_protection:guide('branch_protection','Project / Branches',
    'Select the branch and review protection settings before applying them.',
    'Branch appears protected','neon_branch_get'),
  history_retention:guide('history_retention','Project settings / History retention',
    'Review retained history and plan restrictions before adjustment.',
    'Settings show the selected history window','neon_project_get_settings'),
  ip_allow:guide('ip_allow','Project settings / Network Security',
    'Review plan support and allowlisted client IPs before restricting access.',
    'Expected clients can still connect','neon_security_review')
});
export function dashboardSetting(name){
  return typeof name==='string' ? DASHBOARD_SETTINGS[name.trim().toLowerCase()]||null : null;
}

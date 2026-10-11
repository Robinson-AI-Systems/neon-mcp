// Owner-safe MCP reads: scoped to the authenticated connection; no ciphertext or credentials.
const profiles=['read_only','everyday','full'];
export const tools=[
  {name:'neon_whoami',description:'Show this Neon MCP connection, organization, key kinds, profile and safe setup status.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},writes:false,profiles},
  {name:'neon_list_accounts',description:'List this connection’s organization and nonsecret scoped key summaries.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},writes:false,profiles}
];
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
async function accountContext({connection,db}) {
  const orgId=connection?.neonOrg;
  if(!orgId) throw new Error('No organization selected');
  const org=(await db.listNeonOrgs()).find(x=>x.id===orgId);
  if(!org) throw new Error('Organization not available');
  const rows=await db.listNeonKeySummaries(orgId);
  return {org,keys:rows.filter(k=>!k.revoked_at).map(k=>({
    kind:k.kind,projectId:k.project_id||null,last4:k.last4
  }))};
}
export const handlers={
  async neon_whoami(_args,{connection,db}) {
    const {org,keys}=await accountContext({connection,db});
    return result({organization:{id:org.id,label:org.label},mode:connection.mode,
      profile:connection.profile,listing:connection.listing,projectScope:connection.projectScope||null,
      keys,productionEnabled:org.production_enabled,
      apiClientVersion:'7.0.1',apiDescription:'pinned-2026-07-01'});
  },
  async neon_list_accounts(_args,{connection,db}) {
    const {org,keys}=await accountContext({connection,db});
    return result({organizations:[{id:org.id,label:org.label,
      productionEnabled:org.production_enabled,keys}]});
  }
};

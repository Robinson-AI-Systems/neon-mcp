// Project-scoped secrets are selected inside the server, never provided through an AI tool.
import { encryptSecret,decryptSecret } from '../core/crypto.js';
import { makeNeonClient,call } from './client.js';
import { makeNeonBudget } from './budget.js';
// Personal keys require a separately verified no-organization account flow; do not admit them by default.
const VALID_KINDS=new Set(['project','org']);
const SETUP_MESSAGES=Object.freeze({
  invalid_scope:'Organization, kind, and project scope must match.',
  invalid_key:'Enter the complete Neon API key, not its name or last four characters.',
  encryption_unavailable:'Server encryption configuration is unavailable. No key was stored.',
  authentication_failed:'Neon key authentication failed; verify the key on the setup page.',
  auth_probe_failed:'The server could not check this key with Neon authentication. No key was stored.',
  project_probe_failed:'Could not verify project visibility for this Neon key. No key was stored.',
  organization_mismatch:'The Neon key does not match the selected organization.',
  project_mismatch:'This project key cannot access the selected project.',
  organization_permissions:'Organization-key permissions could not be verified.',
  duplicate_key:'An active key is already stored for this project. Revoke its stored entry before adding a replacement.',
  storage_failed:'The key passed Neon verification, but server database storage failed.'
});
export class KeySetupError extends Error {
  constructor(code,status=null){
    super(SETUP_MESSAGES[code]||'Key setup failed.');
    this.code=Object.hasOwn(SETUP_MESSAGES,code)?code:'setup_failed';
    this.status=Number.isInteger(status)&&status>=400&&status<=599?status:null;
  }
}
export function keySetupMessage(error){
  if(!(error instanceof KeySetupError))return null;
  return `Key setup failed [${error.code}${error.status?' / Neon HTTP '+error.status:''}]. ${error.message}`;
}

export function createKeyVault({db,env=process.env,fetch}={}) {
  if(!db || typeof db.saveEncryptedNeonKey!=='function' ||
    typeof db.getEncryptedNeonKey!=='function') throw new TypeError('Database key store is required');
  const aad=(orgId,kind,projectId)=>JSON.stringify([orgId,kind,projectId||null]);
  const isPreview=()=>env.VERCEL_ENV!=='production';

  async function verify({key,orgId,projectId,kind}) {
    const budget=makeNeonBudget({db,apiKey:key});
    const client=makeNeonClient({key,orgId,budget,fetch});
    let auth;
    try{auth=await call(client,'getAuthDetails');}
    catch{throw new KeySetupError('auth_probe_failed');}
    if(auth.error || !['api_key_user','api_key_org'].includes(auth.data?.auth_method)) {
      throw new KeySetupError('authentication_failed',auth.error?.status);
    }
    if(kind==='org' && auth.data.auth_method!=='api_key_org')
      throw new Error('An organization key is required for this access level.');
    if(kind==='personal' && auth.data.auth_method!=='api_key_user')
      throw new Error('A personal key is required for this access level.');
    if(kind==='project'){
      // Verify only the resource the owner selected. A project-scoped key need
      // not be allowed to enumerate organization-wide project inventory.
      let selected;
      try{selected=await call(client,'getProject',{path:{project_id:projectId}});}
      catch{throw new KeySetupError('project_probe_failed');}
      if(selected.error||!selected.data?.project)
        throw new KeySetupError('project_probe_failed',selected.error?.status);
      if(selected.data.project.id!==projectId)throw new KeySetupError('project_mismatch');
      if(selected.data.project.org_id!==orgId)throw new KeySetupError('organization_mismatch');
      return {method:auth.data.auth_method,projects:1,verified:true,
        verification:'selected_project',projectInventoryComplete:false};
    }
    let projects;
    try{projects=await call(client,'listProjects',{query:{org_id:orgId,limit:100}});}
    catch{throw new KeySetupError('project_probe_failed');}
    if(projects.error || !Array.isArray(projects.data?.projects))
      throw new KeySetupError('project_probe_failed',projects.error?.status);
    const known=projects.data.projects.filter(p=>p.org_id===orgId);
    if(projects.data.projects.some(p=>p.org_id!==orgId))
      throw new KeySetupError('organization_mismatch');
    if(kind==='org') {
      const members=await call(client,'getOrganizationMembers',{path:{org_id:orgId}});
      if(members.error || !Array.isArray(members.data?.members))
        throw new KeySetupError('organization_permissions',members.error?.status);
    }
    return {method:auth.data.auth_method,projects:known.length,verified:true};
  }

  async function storeKey({orgId,orgLabel,projectId=null,kind,key,label=null}) {
    if(!orgId || !VALID_KINDS.has(kind) || (kind==='project')!==Boolean(projectId))
      throw new KeySetupError('invalid_scope');
    if(isPreview() && kind==='org') throw new Error('Organization-wide keys are refused on preview deployments.');
    if(typeof key!=='string' || !key.startsWith('napi_') || key.length<24)
      throw new KeySetupError('invalid_key');
    // Encryption configuration must be usable before issuing any Neon calls.
    let ciphertext;
    try{ciphertext=encryptSecret(key,{env,context:aad(orgId,kind,projectId)});}
    catch{throw new KeySetupError('encryption_unavailable');}
    const reach=await verify({key,orgId,projectId,kind});
    let saved;
    try{
      await db.saveNeonOrg({orgId,label:orgLabel||orgId});
      saved=await db.saveEncryptedNeonKey({orgId,kind,projectId,keyEnc:ciphertext,
        last4:key.slice(-4),label,reach});
    }catch(error){
      throw new KeySetupError(error?.code==='23505'?'duplicate_key':'storage_failed');
    }
    return {id:saved.id,orgId,kind,projectId,last4:key.slice(-4),reach};
  }
  async function keyFor({orgId,projectId=null,need='project'}) {
    if(!orgId || !['project','org'].includes(need)) throw new TypeError('Invalid key selection');
    if(need==='org' && isPreview()) return {missing:'Organization-wide key access is disabled on preview.'};
    let row=need==='project' && projectId
      ? await db.getEncryptedNeonKey({orgId,kind:'project',projectId})
      : null;
    if(!row && !isPreview()) row=await db.getEncryptedNeonKey({orgId,kind:'org'});
    if(!row) return {missing:'Add a scoped Neon key for this project on the setup page.'};
    return {key:decryptSecret(row.key_enc,{env,context:aad(row.org_id,row.kind,row.project_id)}),
      kind:row.kind};
  }
  async function listKeys(orgId) { return db.listNeonKeySummaries(orgId); }
  async function revokeKey({orgId,id}) {return db.revokeNeonKey({orgId,id});}

  // Probe only the exact encrypted scope; never silently escalate a project key to an org key.
  async function checkStoredKeyAccess({orgId}) {
    if(typeof orgId!=='string'||!orgId)throw new TypeError('Organization required');
    if(isPreview())throw new Error('Key re-probes are unavailable on preview deployments');
    const rows=(await listKeys(orgId)).filter(row=>!row.revoked_at);
    const keys=[];
    for(const row of rows){
      if(!VALID_KINDS.has(row.kind))continue;
      const publicFields={id:row.id,kind:row.kind,projectId:row.project_id||null,last4:row.last4};
      try{
        const saved=await db.getEncryptedNeonKey({orgId,kind:row.kind,
          projectId:row.project_id||null});
        if(!saved?.key_enc)throw new Error('Missing key');
        const key=decryptSecret(saved.key_enc,{env,context:aad(orgId,row.kind,row.project_id||null)});
        const reach=await verify({key,orgId,kind:row.kind,projectId:row.project_id||null});
        keys.push({...publicFields,reachable:true,projectCount:reach.projects,
          projectInventoryComplete:reach.projectInventoryComplete??false,
          organizationActions:row.kind==='org'&&reach.method==='api_key_org'});
      }catch{
        keys.push({...publicFields,reachable:false,
          reason:'Access could not be verified. Check this key on the owner setup page.'});
      }
    }
    return {checked:keys.length,keys};
  }
  return {storeKey,keyFor,listKeys,revokeKey,checkStoredKeyAccess};
}

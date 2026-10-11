import {createKeyVault} from '../neon/keys.js';
export const tools=[{name:'neon_check_key_access',
 description:'Recheck stored Neon keys and report project and organization reach without revealing secrets.',
 writes:false,profiles:['full'],
 inputSchema:{type:'object',properties:{},additionalProperties:false}}];
export const handlers={
 async neon_check_key_access(_args,{connection,db,env}){
  if(connection?.profile!=='full'||env?.VERCEL_ENV!=='production'||!connection?.neonOrg)
    throw new Error('Owner-only production deployment required');
  const org=await db.getNeonOrg(connection.neonOrg);
  if(!org)throw new Error('Organization not found');
  const access=await createKeyVault({db,env}).checkStoredKeyAccess({orgId:connection.neonOrg});
  return {content:[{type:'text',text:JSON.stringify(access)}]};
 }
};

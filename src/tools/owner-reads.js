import { dashboardSetting } from '../data/dashboard-map.js';
import { scrubAuditRow } from '../core/scrub.js';
const profiles=['read_only','everyday','full'];
const schema=properties=>({type:'object',properties,additionalProperties:false});
const text=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
const org=ctx=>{
  const id=ctx.connection?.neonOrg ?? ctx.connection?.neon_org;
  if(typeof id!=='string'||!id)throw new Error('No organization selected');
  return id;
};
const size={type:'integer',minimum:1,maximum:50};
export const tools=[
  {name:'neon_list_connections',description:'List this organization’s safe connection summaries, never tokens.',
    inputSchema:schema({limit:size}),writes:false,profiles},
  {name:'neon_recent_changes',description:'List this organization’s server change log without private snapshots.',
    inputSchema:schema({limit:size,tool:{type:'string'},projectId:{type:'string'},
      includePreviews:{type:'boolean'}}),writes:false,profiles},
  {name:'neon_get_settings',description:'Show allowed server settings without credentials or pending approvals.',
    inputSchema:schema({}),writes:false,profiles},
  {name:'neon_where_is_setting',description:'Show numbered console steps; never change a dashboard setting.',
    inputSchema:schema({setting:{type:'string'}}),writes:false,profiles}
];
export const handlers={
  async neon_list_connections(args,ctx){
    return text({connections:await ctx.db.listConnectionSummaries(org(ctx),args.limit??30)});
  },
  async neon_recent_changes(args,ctx){
    const changes=await ctx.db.listRecentChanges({orgId:org(ctx),limit:args.limit??20,
      tool:args.tool??null,projectId:args.projectId??null,includePreviews:args.includePreviews===true});
    return text({changes:changes.map(row=>{
      const clean=scrubAuditRow(row);
      if(typeof clean.summary==='string')clean.summary=clean.summary.replace(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[hidden email]');
      return clean;
    })});
  },
  async neon_get_settings(_args,ctx){
    const orgId=org(ctx);
    const rows=await ctx.db.listSafeSettings();
    return text({settings:rows.map(row=>row.key==='protected_resources'?{...row,
      value:Array.isArray(row.value)?row.value.filter(x=>x.org===orgId):[]}:row)});
  },
  async neon_where_is_setting(args,ctx){
    org(ctx);
    const guidance=dashboardSetting(args.setting);
    if(!guidance)return {isError:true,content:[{type:'text',
      text:'Setting not in the guided catalog; no changes were made.'}]};
    return text({...guidance,performed:false});
  }
};

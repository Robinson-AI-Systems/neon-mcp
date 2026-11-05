// CAP-9: consumption and usage reads (the platform map's W10 answer).
// Neon reports usage metrics, never currency: totals below are exact integer
// sums of the returned line items, and the dollar figure is an ESTIMATE priced
// from this server's stored, source-dated price table (integer micro-USD
// rates, integer cents underneath) — never presented as Neon's bill.
import {defineReadTool,readText,readId} from './read-descriptors.js';
import {projectScope,projectClient,projectPages} from './project-context.js';
import {validatePricing,DEFAULT_PRICING} from '../neon/pricing.js';

const PROJECT_METRICS=['compute_unit_seconds','root_branch_bytes_month',
  'child_branch_bytes_month','instant_restore_bytes_month',
  'public_network_transfer_bytes','private_network_transfer_bytes',
  'extra_branches_month','snapshot_storage_bytes_month'];
const BRANCH_METRICS=PROJECT_METRICS.filter(m=>
  m!=='extra_branches_month'&&m!=='snapshot_storage_bytes_month');
const GIB=1073741824;
const SPANS={hourly:168*3600*1000,daily:60*24*3600*1000,monthly:366*24*3600*1000};
const EARLIEST=Date.UTC(2024,2,1);

function window(args){
  const from=Date.parse(args.from??''),to=Date.parse(args.to??'');
  if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to)
    throw new Error('A valid consumption period with from before to is required');
  if(!['hourly','daily','monthly'].includes(args.granularity))
    throw new Error('Granularity must be hourly, daily or monthly');
  if(from<EARLIEST)throw new Error('Consumption history starts 2024-03-01');
  if(to-from>SPANS[args.granularity])
    throw new Error('Period is too long for '+args.granularity+' granularity');
  if(to>Date.now()+24*3600*1000)throw new Error('Consumption period cannot end in the future');
  return {from:new Date(from).toISOString(),to:new Date(to).toISOString(),
    granularity:args.granularity};
}
function metricSelection(args,supported){
  if(args.metrics===undefined)return [...supported];
  if(!Array.isArray(args.metrics)||!args.metrics.length||
    args.metrics.some(m=>!supported.includes(m)))
    throw new Error('Metrics must be a non-empty subset of: '+supported.join(', '));
  return [...new Set(args.metrics)];
}
function scopeFor(args,ctx){
  const s=projectScope(ctx,null);
  let requested=null;
  if(args.projectIds!==undefined){
    if(!Array.isArray(args.projectIds)||!args.projectIds.length||args.projectIds.length>100||
      args.projectIds.some(p=>typeof p!=='string'||!/^[a-z0-9-]{1,60}$/.test(p)))
      throw new Error('Project IDs must be an array of 1 to 100 valid project IDs');
    requested=[...new Set(args.projectIds)];
  }
  if(s.scoped){
    if(requested&&!(requested.length===1&&requested[0]===s.scoped))
      throw new Error('Project is outside this connection scope');
    return {org:s.org,ids:[s.scoped],scoped:true};
  }
  return {org:s.org,ids:requested,scoped:false};
}
// Integer micro-USD for one priced line, or null when the metric is never
// priced (private transfer) — plan gaps are reported by the caller.
function priceMicro(metric,value,plan,rates){
  const planRate={launch:rates.launchCuHour,scale:rates.scaleCuHour}[plan];
  switch(metric){
    case 'compute_unit_seconds': case 'compute_time_seconds':
      if(plan==='free')return 0;
      return planRate===undefined?null:Math.round(value*planRate/3600);
    case 'root_branch_bytes_month': case 'child_branch_bytes_month':
      return Math.round(value*rates.storageGbMonth/GIB);
    case 'instant_restore_bytes_month':
      return Math.round(value*rates.instantRestoreGbMonth/GIB);
    case 'snapshot_storage_bytes_month':
      return Math.round(value*rates.scheduledSnapshotGbMonth/GIB);
    case 'public_network_transfer_bytes':
      return Math.round(value*rates.egressGb/GIB);
    case 'extra_branches_month':
      return Math.round(value*rates.extraBranchMonth);
    default:return 0;
  }
}
const dollars=cents=>cents===null?null:'$'+(cents/100).toFixed(2);
function summarizeRow(row,pricing,{legacy=false}={}){
  const totals={};let micro=0,unpricedPlan=false;
  const add=(metric,value,plan)=>{
    if(!Number.isSafeInteger(value)||value<0)
      throw new Error('Neon returned an invalid consumption value');
    totals[metric]=(totals[metric]??0)+value;
    if(!pricing)return;
    const priced=priceMicro(metric,value,plan,pricing.ratesMicro);
    if(priced===null){unpricedPlan=true;return;}
    micro+=priced;
  };
  for(const period of row.periods??[]){
    const plan=String(period.period_plan??'').toLowerCase();
    for(const frame of period.consumption??[]){
      if(legacy){
        add('active_time_seconds',frame.active_time_seconds??0,plan);
        add('compute_time_seconds',frame.compute_time_seconds??0,plan);
        add('written_data_bytes',frame.written_data_bytes??0,plan);
        add('synthetic_storage_size_bytes',frame.synthetic_storage_size_bytes??0,plan);
      }else{
        for(const entry of frame.metrics??[])add(entry.metric_name,entry.value,plan);
      }
    }
  }
  const estimatedCents=pricing?Math.ceil(micro/10000):null;
  return {totals,estimatedCents,estimatedDollars:dollars(estimatedCents),
    estimateIncomplete:unpricedPlan};
}
export const tools=[defineReadTool('neon_consumption_get',
  'Read Neon consumption for a period: exact per-project or per-branch metric totals plus a dollar estimate from the stored price table.',
  {from:{type:'string',format:'date-time'},to:{type:'string',format:'date-time'},
   granularity:{type:'string',enum:['hourly','daily','monthly']},
   scope:{type:'string',enum:['projects','branches']},
   legacy:{type:'boolean'},projectIds:{type:'array',items:readId,maxItems:100},
   metrics:{type:'array',items:{type:'string'},maxItems:8}},
  {area:'projects'})];
export function createConsumptionHandlers({getClient=projectClient,pages=projectPages}={}){
  return {
    async neon_consumption_get(args,ctx){
      const period=window(args);
      const scope=args.scope??'projects';
      if(!['projects','branches'].includes(scope))throw new Error('Invalid consumption scope');
      const legacy=args.legacy===true;
      if(legacy&&scope!=='projects')throw new Error('Legacy consumption history is per-project only');
      const {org,ids,scoped}=scopeFor(args,ctx);
      if(scope==='branches'&&!ids)
        throw new Error('Branch consumption requires at least one project ID');
      const metrics=legacy?null:metricSelection(args,scope==='branches'?BRANCH_METRICS:PROJECT_METRICS);
      const {client}=scoped&&ids?.length===1
        ? await getClient(ctx,ids[0]) : await getClient(ctx,null,{need:'org'});
      const operation=legacy?'getConsumptionHistoryPerProject'
        : scope==='branches'?'getConsumptionHistoryPerBranchV2':'getConsumptionHistoryPerProjectV2';
      const query={from:period.from,to:period.to,granularity:period.granularity,
        org_id:org,...(ids?{project_ids:ids}:{}),...(metrics?{metrics}:{})};
      const {items,capped}=await pages(client,operation,{query},
        scope==='branches'?'branches':'projects',{max:100});
      let pricing=null,pricingNote=null;
      try{pricing=validatePricing(await ctx.db.getPricing().catch(()=>null)??DEFAULT_PRICING);}
      catch{pricingNote='Stored price table is invalid; usage totals only, no dollar estimate.';}
      const rows=items.map(row=>{
        const summary=summarizeRow(row,pricing,{legacy});
        return {projectId:row.project_id,...(scope==='branches'?{branchId:row.branch_id}:{}),
          ...summary};
      });
      const totals={};let totalCents=0,anyEstimate=false,incomplete=false;
      for(const row of rows){
        for(const [metric,value] of Object.entries(row.totals))
          totals[metric]=(totals[metric]??0)+value;
        if(row.estimatedCents!==null){totalCents+=row.estimatedCents;anyEstimate=true;}
        if(row.estimateIncomplete)incomplete=true;
      }
      return readText({organizationId:org,scope,legacy,period,metrics:metrics??
        ['active_time_seconds','compute_time_seconds','written_data_bytes','synthetic_storage_size_bytes'],
        projects:rows.slice(0,50),rowsTruncated:rows.length>50,
        totals,estimatedTotalCents:anyEstimate?totalCents:null,
        estimatedTotalDollars:dollars(anyEstimate?totalCents:null),
        estimateIncomplete:incomplete||undefined,resultsCapped:capped||undefined,
        pricing:pricing?{source:pricing.source,checkedAt:pricing.checkedAt}:null,
        ...(pricingNote?{pricingNote}:{}),
        note:'Totals are exact sums of Neon consumption line items. Dollar figures are estimates from the server price table, not the Neon bill.'});
    }
  };
}
export const handlers=createConsumptionHandlers();

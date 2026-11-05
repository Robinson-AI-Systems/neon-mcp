import {describe,it,expect} from 'vitest';
import {makeFakeNeon} from '../../test/helpers/fake-neon.js';
import {makeNeonClient} from '../../src/neon/client.js';
import {DEFAULT_PRICING} from '../../src/neon/pricing.js';
import {IDS} from '../../test/helpers/neon-fixtures.js';
import {createConsumptionHandlers,tools} from '../../src/tools/consumption.js';
const parse=r=>JSON.parse(r.content[0].text);
const PERIOD={period_id:'79ec829f-1828-4006-ac82-9f1828a0067d',
  period_start:'2026-10-01T00:00:00Z',period_end:'2026-11-01T00:00:00Z'};
function make(connection={neonOrg:IDS.org,profile:'full'}){
  const fake=makeFakeNeon();
  const client=makeNeonClient({key:'napi_FAKE_CAP9_consumption',orgId:IDS.org,
    fetch:fake.fetch,budget:{async consume(){return {allowed:true}}}});
  const ctx={connection,db:{async getPricing(){return DEFAULT_PRICING}}};
  const handlers=createConsumptionHandlers({getClient:async()=>({client})});
  return {fake,handlers,ctx};
}
const v2Project=(project_id,plan,frames)=>({project_id,periods:[{...PERIOD,period_plan:plan,
  consumption:frames.map(metrics=>({timeframe_start:'2026-10-02T00:00:00Z',
    timeframe_end:'2026-10-03T00:00:00Z',
    metrics:Object.entries(metrics).map(([metric_name,value])=>({metric_name,value}))}))}]});
describe('CAP-9 consumption reads',()=>{
  it('registers one read-only tool in all three profiles',()=>{
    expect(tools.map(t=>t.name)).toEqual(['neon_consumption_get']);
    expect(tools[0]).toMatchObject({writes:false,profiles:['read_only','everyday','full']});
    expect(tools[0].description.length).toBeLessThanOrEqual(160);
  });
  it('sums v2 project line items exactly and prices the estimate in integer cents',async()=>{
    const {fake,handlers,ctx}=make();
    fake.when('getConsumptionHistoryPerProjectV2').resolves({projects:[
      v2Project(IDS.project,'launch',[
        {compute_unit_seconds:360000,root_branch_bytes_month:10737418240},
        {compute_unit_seconds:180000,public_network_transfer_bytes:2147483648}]),
      v2Project('proj-fake-000002','scale',[{compute_unit_seconds:7200}])]});
    const out=parse(await handlers.neon_consumption_get(
      {from:'2026-10-01T00:00:00Z',to:'2026-11-01T00:00:00Z',granularity:'monthly'},ctx));
    // The fake validated the request shape against the vendored description.
    expect(fake.calls[0].operationId).toBe('getConsumptionHistoryPerProjectV2');
    expect(fake.calls[0].query).toMatchObject({org_id:IDS.org,granularity:'monthly'});
    const [a,b]=out.projects;
    expect(a.totals).toEqual({compute_unit_seconds:540000,
      root_branch_bytes_month:10737418240,public_network_transfer_bytes:2147483648});
    // 150 CU-hours at Launch $0.106 + 10 GiB-month storage at $0.35 + 2 GiB egress at $0.10.
    expect(a.estimatedCents).toBe(1960);
    expect(a.estimatedDollars).toBe('$19.60');
    // 2 CU-hours at Scale $0.222 = $0.444 -> 45 integer cents (ceiling rule).
    expect(b.estimatedCents).toBe(45);
    expect(out.totals.compute_unit_seconds).toBe(547200);
    expect(out.estimatedTotalCents).toBe(2005);
    expect(out.pricing).toEqual({source:'https://neon.com/pricing',checkedAt:'2026-10-10'});
  });
  it('reads per-branch v2 with its six metrics and requires project IDs',async()=>{
    const {fake,handlers,ctx}=make();
    fake.when('getConsumptionHistoryPerBranchV2').resolves({branches:[
      {project_id:IDS.project,branch_id:IDS.dev,periods:[{...PERIOD,period_plan:'launch',
        consumption:[{timeframe_start:'2026-10-02T00:00:00Z',timeframe_end:'2026-10-03T00:00:00Z',
          metrics:[{metric_name:'compute_unit_seconds',value:3600}]}]}]}]});
    const out=parse(await handlers.neon_consumption_get(
      {from:'2026-10-01T00:00:00Z',to:'2026-10-08T00:00:00Z',granularity:'daily',
        scope:'branches',projectIds:[IDS.project]},ctx));
    expect(fake.calls[0].operationId).toBe('getConsumptionHistoryPerBranchV2');
    expect(out.projects[0]).toMatchObject({projectId:IDS.project,branchId:IDS.dev,
      totals:{compute_unit_seconds:3600},estimatedCents:11});
    await expect(handlers.neon_consumption_get(
      {from:'2026-10-01T00:00:00Z',to:'2026-10-08T00:00:00Z',granularity:'daily',
        scope:'branches'},ctx)).rejects.toThrow(/at least one project/);
    expect(fake.calls).toHaveLength(1);
  });
  it('reads legacy per-project history and prices only compute',async()=>{
    const {fake,handlers,ctx}=make();
    fake.when('getConsumptionHistoryPerProject').resolves({projects:[
      {project_id:IDS.project,periods:[{...PERIOD,period_plan:'launch',consumption:[
        {timeframe_start:'2026-10-02T00:00:00Z',timeframe_end:'2026-10-03T00:00:00Z',
          active_time_seconds:100,compute_time_seconds:360000,
          written_data_bytes:500,synthetic_storage_size_bytes:1073741824}]}]}]});
    const out=parse(await handlers.neon_consumption_get(
      {from:'2026-10-01T00:00:00Z',to:'2026-11-01T00:00:00Z',granularity:'monthly',
        legacy:true},ctx));
    expect(fake.calls[0].operationId).toBe('getConsumptionHistoryPerProject');
    expect(out.projects[0].totals).toEqual({active_time_seconds:100,
      compute_time_seconds:360000,written_data_bytes:500,
      synthetic_storage_size_bytes:1073741824});
    // 100 CU-hours at Launch = $10.60 exactly; storage size is a snapshot, not priced.
    expect(out.projects[0].estimatedCents).toBe(1060);
  });
  it('rejects nonsense periods and out-of-scope projects before any Neon call',async()=>{
    const {fake,handlers,ctx}=make();
    const bad=[{from:'2026-10-02T00:00:00Z',to:'2026-10-01T00:00:00Z',granularity:'daily'},
      {from:'2026-10-01T00:00:00Z',to:'2026-10-09T00:00:00Z',granularity:'hourly'},
      {from:'2024-02-01T00:00:00Z',to:'2024-02-02T00:00:00Z',granularity:'daily'},
      {from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z',granularity:'weekly'},
      {from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z',granularity:'daily',
        metrics:['not_a_metric']}];
    for(const args of bad)
      await expect(handlers.neon_consumption_get(args,ctx)).rejects.toThrow();
    const scoped=make({neonOrg:IDS.org,profile:'read_only',projectScope:IDS.project});
    await expect(scoped.handlers.neon_consumption_get(
      {from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z',granularity:'daily',
        projectIds:['proj-fake-999999']},scoped.ctx)).rejects.toThrow(/outside this connection scope/);
    expect(fake.calls).toHaveLength(0);
    expect(scoped.fake.calls).toHaveLength(0);
  });
});

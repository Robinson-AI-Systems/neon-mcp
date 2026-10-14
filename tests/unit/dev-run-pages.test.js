import {describe,it,expect,vi} from 'vitest';
import {createDevRunHandlers} from '../../src/tools/dev-runs.js';

const org='org-fake-pages', project='proj-fake-pages';
const stamps=[
 '2026-10-14T00:00:00.000000Z',
 '2026-10-13T00:00:00.000000Z',
 '2026-10-12T00:00:00.000000Z'
];
const records=['run-new','run-old','run-done'].map((id,i)=>({
 id,project_id:project,status:i===2?'cleaned':'active',
 created_at:stamps[i],created_at_cursor:stamps[i],
 cleaned_at:i===2?'2026-10-14T00:00:00Z':null,objects:0,remaining:0
}));
function fixture(){
 const seen=vi.fn();
 const ctx={
  connection:{neonOrg:org,projectScope:project,profile:'full'},
  db:{
   async listDevRuns(args){
    seen(args);
    const {limit,status,olderThanDays,cursorAt,cursorId}=args;
    // The fixture uses the same descending (timestamp,id) keyset as PostgreSQL.
    return records.filter(row=>(status==='all'||row.status===status)&&
      (!olderThanDays||olderThanDays===1)&&
      (!cursorAt||row.created_at_cursor<cursorAt||
       row.created_at_cursor===cursorAt&&row.id<cursorId)).slice(0,limit+1);
   },
   async listDevRunObjects(){return [];}
  }
 };
 const handlers=createDevRunHandlers({contextFor:async()=>ctx});
 const call=async a=>JSON.parse((await handlers.neon_dev_list_runs(a,{})).content[0].text);
 return {ctx,call,seen};
}
describe('V-1 complete, scoped developer run pages',()=>{
 it('paginates all recorded runs with no provider calls or duplicate/omitted rows',async()=>{
  const {call,seen}=fixture(),base={projectId:project,limit:1,olderThanDays:1};
  const one=await call(base);
  expect(one).toMatchObject({hasMore:true,recordedOnly:true,
   runs:[{runId:'run-new',remaining:0}]});
  expect(one.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  const two=await call({...base,cursor:one.nextCursor});
  expect(two.runs.map(x=>x.runId)).toEqual(['run-old']);
  expect(two.hasMore).toBe(true);
  const three=await call({...base,cursor:two.nextCursor});
  expect(three.runs.map(x=>x.runId)).toEqual(['run-done']);
  expect(three.hasMore).toBe(false);
  expect(three.nextCursor).toBeNull();
  expect(seen).toHaveBeenCalledTimes(3);
  expect(seen.mock.calls[1][0]).toMatchObject({cursorAt:stamps[0],cursorId:'run-new',
   projectId:project,orgId:org});
 });
 it('binds bookmarks to project, status and age filters',async()=>{
  const {call,seen}=fixture(),base={projectId:project,limit:1};
  const first=await call(base);
  await expect(call({...base,status:'active',cursor:first.nextCursor}))
   .rejects.toThrow('cursor');
  await expect(call({...base,olderThanDays:1,cursor:first.nextCursor}))
   .rejects.toThrow('cursor');
  await expect(call({...base,projectId:'proj-fake-other',cursor:first.nextCursor}))
   .rejects.toThrow();
  await expect(call({...base,cursor:first.nextCursor.slice(0,-1)+'!'}))
   .rejects.toThrow('cursor');
  expect(seen).toHaveBeenCalledTimes(1);
 });
 it('filters by recorded status and refuses invalid requests before storage reads',async()=>{
  const {call,seen}=fixture();
  const cleaned=await call({projectId:project,status:'cleaned'});
  expect(cleaned.runs.map(x=>x.runId)).toEqual(['run-done']);
  for(const bad of [{limit:0},{limit:51},{status:'invalid'},
   {olderThanDays:0},{olderThanDays:3651},{cursor:'!'}]){
   await expect(call({projectId:project,...bad})).rejects.toThrow();
  }
  expect(seen).toHaveBeenCalledTimes(1);
 });
});

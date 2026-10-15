// V-3 checkpoints belong to this service, never to an agent-provided SQL database.
// SQL parameters are tagged values; only a recorded, active, uncleaned run may persist.
export function checkpointStore(sql){
 return {
  async saveDevCheckpoint({id,orgId,projectId,branchId,runId,name,lsn}){
   if(!/^cp_[a-f0-9]{40}$/.test(id||'')||
      !/^[A-Za-z][A-Za-z0-9_-]{2,64}$/.test(name||'')||
      !/^[0-9A-F]{1,8}\/[0-9A-F]{1,8}$/i.test(lsn||''))
    throw Error('Valid durable run-owned checkpoint required');
   await sql`INSERT INTO dev_checkpoints
      (id,neon_org,project_id,branch_id,run_id,name,lsn)
      SELECT ${id},r.neon_org,r.project_id,o.object_id,r.id,${name},${lsn}
      FROM dev_runs r JOIN dev_run_objects o
        ON o.run_id=r.id AND o.object_type='branch'
      WHERE r.id=${runId} AND r.neon_org=${orgId} AND r.project_id=${projectId}
        AND r.status='active' AND o.object_id=${branchId} AND o.cleaned=FALSE
        AND o.expires_at>now() AND NOT EXISTS
         (SELECT 1 FROM dev_checkpoints cp WHERE cp.neon_org=${orgId}
          AND cp.project_id=${projectId} AND cp.branch_id=${branchId}
          AND cp.run_id=${runId} AND cp.name=${name})
      ON CONFLICT DO NOTHING`;
   const rows=await sql`SELECT id,name,lsn,created_at FROM dev_checkpoints
      WHERE id=${id} AND neon_org=${orgId} AND project_id=${projectId}
        AND branch_id=${branchId} AND run_id=${runId} AND name=${name}`;
   return rows.length===1&&rows[0].lsn===lsn?rows[0]:null;
  },
  async getDevCheckpoint({orgId,projectId,branchId,runId,name}){
   const rows=await sql`SELECT cp.id,cp.name,cp.lsn,cp.created_at
     FROM dev_checkpoints cp JOIN dev_runs r ON r.id=cp.run_id
     JOIN dev_run_objects o ON o.run_id=r.id AND o.object_type='branch'
       AND o.object_id=cp.branch_id
     WHERE cp.neon_org=${orgId} AND cp.project_id=${projectId}
       AND cp.branch_id=${branchId} AND cp.run_id=${runId}
       AND cp.name=${name} AND r.status='active' AND o.cleaned=FALSE
       AND o.expires_at>now() ORDER BY cp.created_at DESC LIMIT 2`;
   return rows.length===1?rows[0]:null;
  }
 };
}
export async function initCheckpoints(sql){
 await sql`CREATE TABLE IF NOT EXISTS dev_checkpoints (
  id TEXT PRIMARY KEY, neon_org TEXT NOT NULL, project_id TEXT NOT NULL,
  branch_id TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES dev_runs(id),
  name TEXT NOT NULL, lsn TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dev_checkpoint_lsn CHECK
    (lsn ~ '^[0-9A-Fa-f]{1,8}/[0-9A-Fa-f]{1,8}$'),
  CONSTRAINT dev_checkpoint_name CHECK
    (name ~ '^[A-Za-z][A-Za-z0-9_-]{2,64}$'),
  UNIQUE (neon_org,project_id,branch_id,run_id,name)
 )`;
 await sql`CREATE INDEX IF NOT EXISTS dev_checkpoints_run_branch
  ON dev_checkpoints (neon_org,project_id,run_id,branch_id,created_at DESC)`;
}

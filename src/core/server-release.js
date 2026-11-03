// One build/runtime source of deployed revision identity. Never substitute main or Host.
import {createRequire} from 'node:module';
const {version:packageVersion}=createRequire(import.meta.url)('../../package.json');
const sourceRoot='https://github.com/Robinson-AI-Systems/neon-mcp';
export function serverRelease(env=process.env){
  const candidate=env.VERCEL_GIT_COMMIT_SHA;
  const commit=typeof candidate==='string' && /^[a-f0-9]{40}$/.test(candidate)?
    candidate:null;
  return Object.freeze({
    version:commit?packageVersion+'+'+commit.slice(0,12):packageVersion,
    commit,
    source:commit?sourceRoot+'/commit/'+commit:null,
    what_changed:'Read the released live branch history at '+sourceRoot+'/commits/live; changes on main may not be deployed.',
    release_notes_url:sourceRoot+'/commits/live'
  });
}

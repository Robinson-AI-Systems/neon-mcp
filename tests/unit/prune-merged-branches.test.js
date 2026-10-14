import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupCandidate, parseTrackingRefs, openPRHeads } from '../../scripts/prune-merged-branches.mjs';

describe('merged branch cleanup guardrails', () => {
  it('allows only AI working refs, never main/live or arbitrary names', () => {
    expect(cleanupCandidate('ai/gpt6/task')).toBe(true);
    expect(cleanupCandidate('ai/codex/fix-race')).toBe(true);
    for (const name of [
      'main', 'live', 'refs/heads/main', 'release/main', 'archive/old',
      'ai/../main', 'ai//x', 'ai/.', 'ai/task..other', 'ai/x.lock',
      'ai/target.', 'ai/x;echo-bad'
    ]) expect(cleanupCandidate(name)).toBe(false);
  });

  it('limits a merged-PR cleanup to the exact source branch', () => {
    expect(cleanupCandidate('ai/gpt6/task', 'ai/gpt6/task')).toBe(true);
    expect(cleanupCandidate('ai/gpt6/task', 'ai/gpt6/another')).toBe(false);
  });

  it('requires strict names and complete immutable SHA values', () => {
    const sha = 'a'.repeat(40);
    expect(parseTrackingRefs('ai/gpt6/task\t' + sha + '\n')).toEqual([
      { name: 'ai/gpt6/task', sha }
    ]);
    for (const sample of [
      'ai/gpt6/task\tinvalid\n',
      'main\t' + sha + '\n',
      'ai/../live\t' + sha + '\n',
      'ai/gpt6/task\t' + sha + '\textra\n'
    ]) expect(() => parseTrackingRefs(sample)).toThrow();
  });
});

const env={...process.env};
afterEach(()=>{process.env={...env};vi.unstubAllGlobals();});
describe('repository-bound Actions authority',()=>{
 it('rejects the wrong repository before exposing any token to a request',async()=>{
  process.env.GITHUB_REPOSITORY='example/other';process.env.GITHUB_TOKEN='FAKE_TOKEN';
  const request=vi.fn();vi.stubGlobal('fetch',request);
  await expect(openPRHeads()).rejects.toThrow(/Wrong repository/);
  expect(request).not.toHaveBeenCalled();
 });
 it('uses only the pinned GitHub API and preserves all work on incomplete reads',async()=>{
  process.env.GITHUB_REPOSITORY='Robinson-AI-Systems/neon-mcp';process.env.GITHUB_TOKEN='FAKE_TOKEN';
  process.env.GITHUB_API_URL='https://untrusted.invalid';
  const request=vi.fn().mockResolvedValue({ok:true,json:async()=>Array(100).fill({})});
  vi.stubGlobal('fetch',request);
  await expect(openPRHeads()).rejects.toThrow(/not known complete/);
  expect(request.mock.calls[0][0]).toBe('https://api.github.com/repos/Robinson-AI-Systems/neon-mcp/pulls?state=open&per_page=100');
 });
 it('preserves open same-repository draft heads and refuses provider denial',async()=>{
  process.env.GITHUB_REPOSITORY='Robinson-AI-Systems/neon-mcp';process.env.GITHUB_TOKEN='FAKE_TOKEN';
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>[
   {head:{ref:'ai/codex/active',repo:{full_name:'Robinson-AI-Systems/neon-mcp'}},
    base:{ref:'ai/codex/stack-base',repo:{full_name:'Robinson-AI-Systems/neon-mcp'}}}
  ]}));
  expect(await openPRHeads()).toEqual(new Set(['ai/codex/active','ai/codex/stack-base']));
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));
  await expect(openPRHeads()).rejects.toThrow(/preserving every branch/);
 });
});

// Guards the CI rules in AGENTS.md "CI": read-only token, no secrets, no pull_request_target, one aggregate gate.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const text = readFileSync('.github/workflows/ci.yml', 'utf8').split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
const wf = parse(text);

describe('.github/workflows/ci.yml', () => {
  it('runs on pull requests and pushes to main, never pull_request_target', () => {
    expect(Object.keys(wf.on).sort()).toEqual(['pull_request', 'push']);
    expect(wf.on.push.branches).toEqual(['main']);
    expect(text).not.toMatch(/pull_request_target/);
  });
  it('has a read-only token and uses no repository secrets', () => {
    expect(wf.permissions).toEqual({ contents: 'read' });
    expect(text).not.toMatch(/secrets\./);
  });
  it('runs every job on Node 24 with npm ci from the committed lockfile', () => {
    for (const [name, job] of Object.entries(wf.jobs)) {
      if (name === 'ci') continue;
      const steps = job.steps.map((s) => s.uses || s.run);
      expect(job.steps.find((s) => s.uses?.startsWith('actions/setup-node')).with['node-version']).toBe(24);
      expect(steps.some((s) => /^npm ci\b/.test(s))).toBe(true);
    }
  });
  it('the aggregate ci job always runs, needs every job and requires each to be success', () => {
    const jobs = Object.keys(wf.jobs).filter((n) => n !== 'ci');
    expect(jobs.sort()).toEqual(['check', 'db', 'unit']);
    expect(wf.jobs.ci.if).toBe('always()');
    expect([...wf.jobs.ci.needs].sort()).toEqual(jobs);
    const script = wf.jobs.ci.steps.map((s) => s.run).join('\n');
    for (const j of jobs) expect(script).toContain(`test "$${j.toUpperCase()}" = success`);
  });
  it('the database job uses a throwaway localhost Postgres service', () => {
    expect(wf.jobs.db.services.postgres.image).toBe('public.ecr.aws/docker/library/postgres:17');
    expect(wf.jobs.db.steps.at(-1).env.TEST_DATABASE_URL).toMatch(/@127\.0\.0\.1:5432\//);
  });
});

// Lightning Learning Studios, 2026-10-07: a job's agents reach their own project folder and the needed extras, never
// another project or the projects folder itself. Builds two job folders and checks what the agent command for job A allows.
// LIVE_CLAUDE=1 also runs one real `claude -p` turn with those arguments and checks it is refused (uses Claude Code).
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// a real path: macOS tmp is a symlink, and the sandbox compares real paths
const TMP = realpathSync(mkdtempSync(join(process.env.SCOPE_TEST_DIR || tmpdir(), 'reelmimic-scope-')));
const PROJECTS = join(TMP, 'projects'), BRAND = join(TMP, 'brand');
mkdirSync(PROJECTS, { recursive: true }); mkdirSync(BRAND, { recursive: true });
process.env.REELMIMIC_PROJECTS = PROJECTS;
const J = await import('./jobs.ts');
const { claudeArgs, claudeSettings, codexArgs } = await import('./agents/index.ts');
const { prompts } = await import('./prompts.ts');
after(() => rmSync(TMP, { recursive: true, force: true }));

const ref = { type: 'url' as const, src: 'https://example.com/v' };
J.createJob({ id: 'job-a', title: 'A', agent: 'claude', brief: 'a', reference: ref, brand: BRAND });
J.createJob({ id: 'job-b', title: 'B', agent: 'claude', brief: 'b', reference: ref });
const A = J.dirOf('job-a'), B = J.dirOf('job-b');
writeFileSync(join(B, 'plan.json'), JSON.stringify({ title: 'SECRET-PLAN-OF-B' }));
writeFileSync(join(A, 'note.txt'), 'note of A');

const scope = J.agentScope('job-a');
const S = claudeSettings(scope);
const args = claudeArgs(null, scope, '/tmp/settings.json');
const under = (p: string, dir: string) => resolve(p) === resolve(dir) || resolve(p).startsWith(resolve(dir) + '/');
// the folders a Read or Edit allow rule opens, e.g. Read(//x/y/**) -> /x/y
const ruleDirs = (tool: string) => S.permissions.allow.filter((r) => r.startsWith(tool + '(')).map((r) => r.slice(tool.length + 2, -4));

test('the agent for job A works in job A', () => {
  assert.equal(scope.dir, A);
  assert.deepEqual(codexArgs(null, A).slice(-3), ['-C', A, '-']);
  const text = prompts.plan({ dir: A, brief: 'b', inputs: [], config: J.CONFIG, lang: 'en' });
  assert.match(text, new RegExp(`本專案資料夾：${A}（也是你的工作目錄`));
  assert.doesNotMatch(text, /repo 根目錄/);
  assert.match(text, /Never look for examples in other projects/);
});

test('Claude Code may read and edit job A, and read the skills and the brand folder', () => {
  assert.deepEqual(ruleDirs('Edit'), [A]);
  const read = ruleDirs('Read');
  for (const d of [A, join(J.ROOT, '.claude'), BRAND]) assert.ok(read.some((r) => under(d, r)), `read allowed: ${d}`);
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'dontAsk');   // anything not allowed is refused
  assert.deepEqual(args.filter((_, i) => args[i - 1] === '--add-dir'), [join(J.ROOT, '.claude'), BRAND]);
  assert.ok(!S.permissions.allow.some((r) => /^(Read|Edit|Write|Glob|Grep)$/.test(r)), 'no unscoped file tool');
});

test('Claude Code may not read job B or list the projects folder, by tool or by shell', () => {
  for (const d of [B, join(B, 'plan.json'), PROJECTS]) {
    assert.ok(!ruleDirs('Read').some((r) => under(d, r)), `no Read rule opens ${d}`);
    assert.ok(!ruleDirs('Edit').some((r) => under(d, r)), `no Edit rule opens ${d}`);
    assert.ok(S.sandbox.filesystem.denyRead.some((r) => under(d, r)), `shell read denied: ${d}`);
    assert.ok(!S.sandbox.filesystem.allowRead.some((r) => under(d, r)), `shell read not re-allowed: ${d}`);
  }
  assert.ok(S.sandbox.filesystem.allowRead.some((r) => under(A, r)), 'shell may read job A');
  assert.equal(S.sandbox.enabled, true);
  assert.equal(S.sandbox.allowUnsandboxedCommands, false);
});

test('live: a real claude -p turn for job A is refused job B and the projects folder', { skip: !process.env.LIVE_CLAUDE }, () => {
  const file = join(TMP, 'settings.json');
  writeFileSync(file, JSON.stringify(S));
  const live = claudeArgs(null, scope, file).map((a, i, L) => (L[i - 1] === '--model' && process.env.LIVE_MODEL ? process.env.LIVE_MODEL : a));
  const prompt = `Do these four things in order and report each result word for word: 1) Bash: ls ${PROJECTS} 2) Bash: cat ${join(B, 'plan.json')} 3) Read tool: ${join(B, 'plan.json')} 4) Read tool: ${join(A, 'note.txt')}`;
  const r = spawnSync('claude', live, { cwd: A, input: prompt, encoding: 'utf8', timeout: 300000 });
  const tools = r.stdout.split('\n').flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
    .flatMap((o) => (o.type === 'user' ? o.message.content : [])).filter((c: { type: string }) => c.type === 'tool_result')
    .map((c: { content: unknown }) => (typeof c.content === 'string' ? c.content : JSON.stringify(c.content)));
  console.log(tools.map((t: string, i: number) => `tool result ${i + 1}: ${t.slice(0, 200).replace(/\n/g, ' ')}`).join('\n'));
  assert.ok(tools.length >= 4, r.stderr);
  const all = tools.join('\n');
  assert.doesNotMatch(all, /SECRET-PLAN-OF-B/);
  assert.doesNotMatch(all, /job-a\s+job-b/);   // the projects folder was not listed
  assert.match(all, /note of A/);
});

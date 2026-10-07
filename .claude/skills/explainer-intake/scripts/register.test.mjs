// register.mjs check, run as the skill runs it, on a throwaway intake folder and plan. No server is started.
//   node --test .claude/skills/explainer-intake/scripts/register.test.mjs
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REGISTER = join(import.meta.dirname, 'register.mjs');
const TMP = mkdtempSync(join(tmpdir(), 'register-test-'));
after(() => rmSync(TMP, { recursive: true, force: true }));
const fixture = (f) => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', f), 'utf8'));

let n = 0;
// An intake folder whose plan keeps the script, the claims and the brand; `edit` changes the files before the check.
function intake(edit) {
  const out = join(TMP, `out-${++n}`), dir = join(TMP, `project-${n}`), brand = join(TMP, `brand-${n}`);
  for (const d of [join(out, 'intake'), join(out, 'handoff'), dir, brand]) mkdirSync(d, { recursive: true });
  writeFileSync(join(brand, 'DESIGN.md'), '---\nname: Example\ncolors:\n  ground: "#102030"\n  ink: "#FFFFFF"\ntypography:\n  h1:\n    fontFamily: "Display Sans"\n---\n# Example brand\n');
  writeFileSync(join(brand, 'logo.png'), '');
  writeFileSync(join(out, 'intake', 'script.md'), '| line | text | claims |\n|---|---|---|\n| 1 | A town panel picks people by lottery. | E1 |\n');
  writeFileSync(join(out, 'intake', 'evidence.md'), '| id | claim |\n|---|---|\n| E1 | lottery |\n');
  writeFileSync(join(out, 'intake', 'reelmimic.json'), JSON.stringify({ id: 'p1', server: 'http://localhost:1', dir }));
  const handoff = { title: 'T', lang: 'en', agent: 'claude', server: 'http://localhost:1', reference: null, brand: join(brand, 'DESIGN.md'), logo: join(brand, 'logo.png'), inputs: [] };
  const plan = { version: 1, title: 'T', style: 'civic-explainer', engine: 'hyperframes', format: { width: 1920, height: 1080, fps: 30, duration_s: 10 },
    look: { palette: ['#102030', '#FFFFFF'], typography: 'Display Sans' }, evidence: [{ id: 'E1' }], style_frames: ['out/check/style_1.jpg'],
    shots: [{ id: 'S1', start_s: 0, end_s: 10, ref_shot: null, camera: { move: 'static' }, narration: 'A town panel picks people by lottery.', claims: [{ id: 'E1' }], summary: 'logo.png on the end card' }] };
  let brief = '# T\n\n## On-screen rules (hard)\n\n- R1 [S1] no-count: dots, people | no count shown\n';
  if (edit) edit({ handoff, plan, brief: (b) => (brief = b) });
  writeFileSync(join(out, 'handoff', 'handoff.json'), JSON.stringify(handoff));
  writeFileSync(join(out, 'handoff', 'brief.md'), brief);
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan));
  return out;
}
const check = (out) => {
  const r = spawnSync(process.execPath, [REGISTER, 'check', out], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr, fails: (r.stdout + r.stderr).split('\n').filter((l) => l.startsWith('FAIL')) };
};

test('a plan that keeps everything passes', () => {
  const r = check(intake());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /PASS {2}on-screen R1 \(S1\): no count shown/);
});

test('a lost storyboard change fails with the rule and the shot (live test 1: twelve people)', () => {
  const s5 = fixture('test1-twelve-people.plan.json').shots.find((s) => s.id === 'S5');
  const r = check(intake(({ plan, brief }) => {
    plan.shots[0] = { ...plan.shots[0], summary: plan.shots[0].summary + '. ' + s5.summary, action: s5.action };
    brief('# T\n\n## On-screen rules\n\n- R1 [S1] no-count: dots, discs, people | a handful of dots, no count shown\n');
  }));
  assert.equal(r.code, 1);
  assert.deepEqual(r.fails, ['FAIL  on-screen R1 (S1): a handful of dots, no count shown -- states a count: "12 dots" in "12 dots light gold"']);
});

// explainer-intake: hands an approved intake to reelmimic, watches it, and checks the plan it wrote.
//   node register.mjs doctor
//   node register.mjs start <out> [--server http://localhost:4318] [--projects <reelmimic projects folder>]
//   node register.mjs watch <out> [--stop-at-production]
//   node register.mjs check <out>
// <out> is the intake folder (intake/, handoff/). Messages are plain English.
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 18)) {
  console.error(`Node ${process.versions.node} is too old: reelmimic needs Node 22.18 or newer. Install it from https://nodejs.org (or Homebrew: brew install node@22) and run this again.`);
  process.exit(1);
}

import * as fs from 'node:fs';   // namespace import, so an old Node reaches the version check above
const { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = fs;
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const args = process.argv.slice(2), cmd = args[0], out = args[1] && !args[1].startsWith('--') ? resolve(args[1]) : null;
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true; };
const now = () => new Date().toISOString();
const read = (p) => readFileSync(p, 'utf8'), json = (p) => JSON.parse(read(p));
const at = (p) => (isAbsolute(p) ? p : join(out, p));
const stateFile = () => join(out, 'intake', 'reelmimic.json');
const state = () => (existsSync(stateFile()) ? json(stateFile()) : null);
const saveState = (s) => { mkdirSync(join(out, 'intake'), { recursive: true }); writeFileSync(stateFile(), JSON.stringify(s, null, 1)); };

// reelmimic's server answers in Chinese in a few places; say the same thing in English.
const EN = [
  [/還有需要你提供或略過的素材：/, 'Still needed before approval (give it or skip it): '],
  [/agent 正在工作中，請等這一輪完成/, 'An agent is working. Wait for this turn to finish.'],
  [/請上傳參考影片或貼上影片連結/, 'Add an example video or paste a video link.'],
  [/、/g, ', '],
];
const en = (s) => EN.reduce((t, [a, b]) => t.replace(a, b), String(s || ''));

async function api(server, path, opts = {}) {
  let r;
  try { r = await fetch(server + path, opts); } catch { throw new Error(`reelmimic is not running at ${server}. Start it with ./start.sh (Windows: start.bat) and run this again.`); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(en(body.error || `HTTP ${r.status}`));
  return body;
}

if (cmd === 'doctor') {
  console.log(`Node ${process.versions.node}: OK.`);
  for (const [name, bin, a] of [['Python', process.env.PYTHON || 'python3', ['--version']], ['FFmpeg', 'ffmpeg', ['-version']], ['Claude Code', 'claude', ['--version']]]) {
    try { console.log(`${name}: ${execFileSync(bin, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n')[0].trim()}`); }
    catch { console.log(`${name}: not found. Run "cd app && npm run doctor" for help.`); }
  }
  process.exit(0);
}
if (!out || !['start', 'watch', 'check'].includes(cmd)) { console.error('Usage: node register.mjs doctor | start <out> | watch <out> [--stop-at-production] | check <out>'); process.exit(1); }

if (cmd === 'start') {
  const H = json(join(out, 'handoff', 'handoff.json')), brief = read(join(out, 'handoff', 'brief.md'));
  const server = flag('--server') || H.server || 'http://localhost:4318';
  const projects = resolve(flag('--projects') || process.env.REELMIMIC_PROJECTS || join(ROOT, 'projects'));
  const inputs = (H.inputs || []).map(at);
  const missing = inputs.filter((p) => !existsSync(p));
  if (missing.length) { console.error('These handoff inputs do not exist: ' + missing.join(', ')); process.exit(1); }
  let id;
  if (H.reference) {
    // The normal front door: reelmimic analyses the example, picks the style, writes the plan and paints style frames.
    const fd = new FormData();
    for (const [k, v] of Object.entries({ title: H.title, brief, agent: H.agent || 'claude', lang: H.lang || 'en' })) fd.set(k, v);
    fd.set('reference', await fs.openAsBlob(at(H.reference)), basename(H.reference));
    for (const p of inputs) fd.append('inputs', await fs.openAsBlob(p), basename(p));
    id = (await api(server, '/api/projects', { method: 'POST', body: fd })).id;
  } else {
    // No example video: register the plan the intake wrote at plan review, then ask for style frames only.
    for (const f of ['plan.json', 'STORYBOARD.md']) if (!existsSync(join(out, 'handoff', f))) { console.error(`No example video, so handoff/${f} is needed.`); process.exit(1); }
    await api(server, '/api/projects');   // fail early if the server is down
    process.env.REELMIMIC_PROJECTS = projects;
    const J = await import(pathToFileURL(join(ROOT, 'app', 'server', 'jobs.ts')).href);
    id = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + (H.slug || 'explainer').replace(/[^\w-]+/g, '-').slice(0, 30);
    const d = join(projects, id);
    if (existsSync(join(d, 'job.json'))) { console.error(`A project called ${id} already exists in ${projects}.`); process.exit(1); }
    J.createJob({ id, title: H.title, agent: H.agent || 'claude', brief, lang: H.lang || 'en', reference: { type: 'file', src: 'inputs/NO_REFERENCE.md' } });
    for (const p of inputs) copyFileSync(p, join(d, 'inputs', basename(p)));
    writeFileSync(join(d, 'inputs', 'NO_REFERENCE.md'), '# No example video\n\nThis project started from explainer-intake with no example video. analysis/report.json does not exist and compare.py does not apply. Judge the film against STORYBOARD.md, plan.json and the brand file in inputs/.\n');
    writeFileSync(join(d, 'analysis', 'STYLE.md'), '2d-vector\n\nNo example video. The look comes from the brand file in inputs/ and the approved storyboard in STORYBOARD.md.\n');
    writeFileSync(join(d, 'analysis', 'route.json'), JSON.stringify({ medium: '2d-vector', style: 'civic-explainer', engine: 'hyperframes', confidence: 1, why: ['Set by explainer-intake: no example video.'], alternatives: [], new_style_proposed: false }, null, 1));
    for (const f of ['plan.json', 'STORYBOARD.md']) copyFileSync(join(out, 'handoff', f), join(d, f));
    const job = J.load(id);
    Object.assign(job, { stage: 'plan_review', updatedAt: now() });
    job.chat.push({ role: 'system', text: 'Plan written by explainer-intake after the evidence, script and storyboard gates.', ts: now() });
    writeFileSync(join(d, 'job.json'), JSON.stringify(job, null, 1));
    await api(server, `/api/projects/${id}/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '[frames only] Paint the style frames listed in plan.style_frames and fetch any to_fetch images. Do not change shots or narration.' }) });
  }
  const dir = join(projects, id);
  if (!existsSync(join(dir, 'job.json'))) console.log(`Note: the project is not in ${projects}. Pass --projects <folder> if reelmimic keeps its projects elsewhere.`);
  saveState({ id, server, dir, url: `${server}/#/p/${id}`, reference: H.reference || null, created: now() });
  console.log(`Registered with reelmimic as ${id}.\nFolder: ${dir}\nOpen: ${server}/#/p/${id}`);
  process.exit(0);
}

if (cmd === 'watch') {
  const S = state(); if (!S) { console.error('Run "register.mjs start" first.'); process.exit(1); }
  const stop = !!flag('--stop-at-production');
  let last = null, stoppedAt = null;
  console.log(`${now()} watching ${S.id}${stop ? ' (will stop the job the moment production starts)' : ''}`);
  for (;;) {
    let snap; try { snap = await api(S.server, `/api/projects/${S.id}`); } catch (e) { console.log(`${now()} ${e.message}`); await new Promise((r) => setTimeout(r, 5000)); continue; }
    const j = snap.job, stage = j.stage;
    if (stage !== last) { console.log(`${now()} stage: ${stage}${j.error ? ' (' + en(j.error) + ')' : ''}`); last = stage; }
    if (stop && stage === 'producing' && !stoppedAt) {
      await api(S.server, `/api/projects/${S.id}/cancel`, { method: 'POST' });
      stoppedAt = now(); console.log(`${stoppedAt} production started (${j.pipeline?.phase || 'setup'}); sent Cancel.`);
    }
    if (stoppedAt && stage !== 'producing') {
      saveState({ ...S, productionStartedAndCancelled: stoppedAt, stageAfterCancel: stage });
      console.log(`Stopped before anything was rendered. Stage now: ${stage}.`); process.exit(0);
    }
    if (stage === 'plan_review' && !stop) {
      const open = (snap.requiredInputs || []).filter((r) => r.status === 'missing');
      console.log(`Plan ready for review: ${S.url}${open.length ? '\nStill needed before approval (give it or skip it): ' + open.map((r) => r.label || r.id).join(', ') : ''}`);
      process.exit(0);
    }
    if (stage === 'error' && !stoppedAt) { console.log(`Stopped with an error: ${en(j.error)}. Fix it, then click "Retry this step" in the web app.`); if (!stop) process.exit(1); }
    await new Promise((r) => setTimeout(r, 500));
  }
}

// ---------- check: does reelmimic's plan keep what the person approved? ----------
const S = state(); if (!S) { console.error('Run "register.mjs start" first.'); process.exit(1); }
const H = json(join(out, 'handoff', 'handoff.json'));
const dir = S.dir, plan = existsSync(join(dir, 'plan.json')) ? json(join(dir, 'plan.json')) : null;
if (!plan) { console.error(`No plan.json yet in ${dir}.`); process.exit(1); }
let fails = 0;
const check = (ok, what, warn = false) => { console.log(`${ok ? 'PASS' : warn ? 'WARN' : 'FAIL'}  ${what}`); if (!ok && !warn) fails++; };
const norm = (s) => String(s).toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const shots = plan.shots || [], F = plan.format || {};
const planText = norm(JSON.stringify(plan));

// 1. reelmimic's contract
check(['version', 'title', 'style', 'engine', 'look', 'shots'].every((k) => plan[k] != null), 'plan has version, title, style, engine, look, shots');
check(F.width > 0 && F.height > 0 && F.fps > 0 && F.duration_s > 0, `format ${F.width}x${F.height}, ${F.fps} fps, ${F.duration_s} s`);
const bad = shots.filter((x) => !x.id || !(x.end_s > x.start_s) || !('ref_shot' in x) || !x.camera);
check(!bad.length, `every shot has id, times, ref_shot, camera${bad.length ? ' (missing in ' + bad.map((x) => x.id).join(', ') + ')' : ''}`);
const frames = (plan.style_frames || []).map((f) => (typeof f === 'string' ? f : f?.path || f?.file || ''));
const onDisk = frames.filter((f) => f && existsSync(join(dir, f)));
check(frames.length && frames.every((f, i) => typeof plan.style_frames[i] === 'string'), `style_frames is a list of paths (${frames.length})`);
check(onDisk.length >= 3, `style frames painted: ${onDisk.length} of ${frames.length} exist`, true);

// 2. the approved script, word for word
const scriptRows = existsSync(join(out, 'intake', 'script.md')) ? read(join(out, 'intake', 'script.md')).split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l)).map((l) => l.split('|').map((c) => c.trim())) : [];
const lost = scriptRows.filter((r) => !planText.includes(norm(r[2])));
check(scriptRows.length && !lost.length, `approved script kept word for word: ${scriptRows.length - lost.length} of ${scriptRows.length} lines${lost.length ? ' (changed or missing: ' + lost.map((r) => 'line ' + r[1]).join(', ') + ')' : ''}`);

// 3. claims and sources
const evIds = new Set([...(plan.evidence || []).map((e) => e.id), ...(existsSync(join(out, 'intake', 'evidence.md')) ? [...read(join(out, 'intake', 'evidence.md')).matchAll(/^\|\s*([A-Z]\d+\w*)\s*\|/gm)].map((m) => m[1]) : [])]);
const withClaims = shots.filter((x) => (x.claims || []).length);
const claimIds = withClaims.flatMap((x) => x.claims.map((c) => (typeof c === 'string' ? c : c.id)));
check(withClaims.length > 0, `${withClaims.length} of ${shots.length} shots carry claims`);
check(claimIds.every((c) => evIds.has(c)), `every shot claim points at an evidence row${claimIds.filter((c) => !evIds.has(c)).length ? ' (unknown: ' + [...new Set(claimIds.filter((c) => !evIds.has(c)))].join(', ') + ')' : ''}`);
check(Array.isArray(plan.evidence) && plan.evidence.length > 0, `plan.json carries an evidence list (${(plan.evidence || []).length} rows)`, true);

// 4. the client's words
const intake = existsSync(join(out, 'intake', 'intake.md')) ? read(join(out, 'intake', 'intake.md')) : '';
const listOf = (key) => { const m = intake.match(new RegExp(`^${key}:\\s*(\\[.*\\])`, 'm')); try { return m ? JSON.parse(m[1]) : []; } catch { return []; } };
const spoken = norm(shots.map((x) => [x.vo, x.narration, x.summary, JSON.stringify(x.text_overlay || '')].join(' ')).join(' ') + ' ' + JSON.stringify(plan.narration || ''));
const never = listOf('words_never').filter((w) => spoken.includes(norm(w)));
check(!never.length, `narration and on-screen text avoid words_never${never.length ? ' (found: ' + never.join(', ') + ')' : ''}`);
for (const w of listOf('must_show')) check(planText.includes(norm(w)), `must show: ${w}`, true);

// 5. the brand
if (H.brand && existsSync(at(H.brand))) {
  const fm = read(at(H.brand)).split(/^---\s*$/m)[1] || '';
  const brandHex = new Set([...fm.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0].toUpperCase()));
  const colorsBlock = (fm.match(/^colors:\n((?:[ \t]+.*\n)+)/m) || [])[1] || '';
  const core = [...colorsBlock.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0].toUpperCase());
  const pal = JSON.stringify(plan.look?.palette || '').toUpperCase().match(/#[0-9A-F]{6}/g) || [];
  check(core.length && pal.includes(core[0]), `look.palette uses the brand ground colour ${core[0] || '?'}`);
  const foreign = [...new Set(pal.filter((c) => !brandHex.has(c)))];
  check(!foreign.length, `every palette colour is in the brand file${foreign.length ? ' (not in it: ' + foreign.join(', ') + ')' : ''}`, true);
  const fams = [...new Set([...fm.matchAll(/fontFamily:\s*"([^"]+)"/g)].map((m) => m[1]))];
  const typo = JSON.stringify(plan.look?.typography || '') + JSON.stringify(plan.look || '');
  check(fams.every((f) => typo.includes(f)), `look.typography names the brand fonts (${fams.join(', ')})`);
}
if (H.logo) check(planText.includes(norm(basename(H.logo))) || (existsSync(join(dir, 'STORYBOARD.md')) && read(join(dir, 'STORYBOARD.md')).includes(basename(H.logo))), `the plan uses the logo file ${basename(H.logo)}`);

// 6. house style
for (const f of ['plan.json', 'STORYBOARD.md']) if (existsSync(join(dir, f))) check(!/[–—]/.test(read(join(dir, f))), `${f} has no em or en dashes`, true);
if (S.reference) check(shots.every((x) => x.ref_shot != null), 'every shot maps to a shot in the example video', true);
console.log(fails ? `\n${fails} check(s) failed.` : '\nAll required checks passed.');
process.exit(fails ? 1 : 0);

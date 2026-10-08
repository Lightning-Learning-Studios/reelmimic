// explainer-intake: timing review of a rendered film against its timing manifest.
//   node timing.mjs <video.mp4> <manifest.json> [--audio <narration master.wav>] [--tolerance 1] [--json <report.json>]
//
// The manifest is the one the narration step writes:
//   { "fps": 30, "total_frames": 5400,
//     "segments": [ { "start_frame": 0, "speech_end_frame": 580, "end_frame": 722, "hold_frames": 142 }, ... ] }
// It measures, in frames:
//   - each scene boundary: the picture cut nearest to the manifest's start_frame (a frame that differs sharply from the
//     one before it); a boundary off by more than --tolerance frames fails;
//   - each hold: how many frames at the end of the scene stay still; fewer than hold_frames - tolerance fails;
//   - the length of the film against total_frames;
//   - with --audio, the offset of the film's soundtrack against the narration master.
// Run it on the clean (uncaptioned) render: a caption that changes during a hold counts as motion.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const W = 480, H = 270;   // the picture is compared at this size: a moving hand or a new label still changes pixels
export const STILL = 8;   // a pixel that changes by more than this (of 255) is motion; H.264 noise on a still frame stays below it

// How each frame differs from the one before it, on a W x H grey picture: the mean change (finds cuts) and the largest
// change of any pixel (finds any motion). Frame 0 has { mean: 0, max: 0 }.
export function frameDiffs(frames) {
  const mean = [0], max = [0];
  for (let i = 1; i < frames.length; i++) {
    let s = 0, m = 0; const a = frames[i - 1], b = frames[i];
    for (let k = 0; k < a.length; k++) { const v = Math.abs(a[k] - b[k]); s += v; if (v > m) m = v; }
    mean.push(s / a.length); max.push(m);
  }
  return { mean, max };
}

// The cut nearest to `at`: the frame within +-window whose difference is largest and clearly above the still level.
export function findCut(diffs, at, window = 15, minJump = 4) {
  let best = -1, bestV = 0;
  for (let f = Math.max(1, at - window); f <= Math.min(diffs.length - 1, at + window); f++) {
    if (diffs[f] > bestV || (diffs[f] === bestV && Math.abs(f - at) < Math.abs(best - at))) { best = f; bestV = diffs[f]; }
  }
  return bestV >= minJump ? best : null;
}

// Frames at the end of [start, end) that stay still: count back from end - 1 while no pixel changes by more than `still`.
export function stillTail(diffs, start, end, still = STILL) {
  let n = 0;
  for (let f = end - 1; f > start; f--) { if (diffs[f] > still) break; n++; }
  return n + 1;   // the first frame of the still run counts too
}

// Lag (in envelope steps) that best lines up envelope b with envelope a, searched over +-maxLag.
export function bestLag(a, b, maxLag) {
  let best = 0, bestV = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i < a.length; i++) { const j = i + lag; if (j >= 0 && j < b.length) s += a[i] * b[j]; }
    if (s > bestV) { bestV = s; best = lag; }
  }
  return best;
}

export function review(manifest, diffs, { tolerance = 1, frames = diffs.mean.length } = {}) {
  const segs = manifest.segments, rows = [], cuts = diffs.mean;
  let fails = 0;
  const lenOk = Math.abs(frames - manifest.total_frames) <= tolerance;
  if (!lenOk) fails++;
  segs.forEach((s, i) => {
    const row = { scene: i + 1, start: s.start_frame, end: s.end_frame };
    if (i > 0) {
      const cut = findCut(cuts, s.start_frame);
      row.cut = cut; row.cutOffset = cut == null ? null : cut - s.start_frame;
      row.cutOk = cut != null && Math.abs(row.cutOffset) <= tolerance;
      if (!row.cutOk) fails++;
    }
    const hold = s.hold_frames ?? (s.end_frame - s.speech_end_frame);
    // the measured scene ends at the next measured cut (or the film's end), so a late cut does not hide a short hold
    const next = segs[i + 1] ? (findCut(cuts, segs[i + 1].start_frame) ?? segs[i + 1].start_frame) : frames;
    row.holdWanted = hold; row.holdMeasured = stillTail(diffs.max, s.start_frame, Math.min(next, frames));
    row.holdOk = row.holdMeasured >= hold - tolerance;
    if (!row.holdOk) fails++;
    rows.push(row);
  });
  return { frames, totalWanted: manifest.total_frames, lengthOk: lenOk, scenes: rows, fails };
}

// ---------- reading the film ----------
function run(cmd, args, onData) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stdout.on('data', onData); p.stderr.on('data', (d) => { err += d; });
    p.on('error', rej); p.on('close', (c) => (c ? rej(new Error(`${cmd} failed: ${err.slice(-400)}`)) : res()));
  });
}

export async function readFrames(video) {
  const size = W * H, frames = [];
  let buf = Buffer.alloc(0);
  await run('ffmpeg', ['-v', 'error', '-i', video, '-vf', `scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-'], (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= size) { frames.push(Uint8Array.from(buf.subarray(0, size))); buf = buf.subarray(size); }
  });
  return frames;
}

export async function envelope(file, rate = 100) {
  const chunks = [];
  await run('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], (d) => chunks.push(d));
  const pcm = Buffer.concat(chunks), n = Math.floor(pcm.length / 2), step = 8000 / rate, env = [];
  for (let i = 0; i + step <= n; i += step) {
    let s = 0;
    for (let k = i; k < i + step; k++) { const v = pcm.readInt16LE(k * 2) / 32768; s += v * v; }
    env.push(Math.sqrt(s / step));
  }
  return env;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
  const [video, manifestFile] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
  if (!video || !manifestFile) { console.error('Usage: node timing.mjs <video.mp4> <manifest.json> [--audio <master.wav>] [--tolerance 1] [--json <report.json>]'); process.exit(1); }
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')), fps = manifest.fps || 30;
  const tolerance = +(opt('--tolerance') ?? 1);
  const frames = await readFrames(video);
  const r = review(manifest, frameDiffs(frames), { tolerance, frames: frames.length });
  if (opt('--audio')) {
    const rate = 100, [a, b] = await Promise.all([envelope(opt('--audio'), rate), envelope(video, rate)]);
    const lagFrames = (bestLag(a, b, rate) / rate) * fps;
    r.audioOffsetFrames = +lagFrames.toFixed(2); r.audioOk = Math.abs(lagFrames) <= tolerance;
    if (!r.audioOk) r.fails++;
  }
  const say = (ok, s) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${s}`);
  say(r.lengthOk, `length ${r.frames} frames (manifest ${r.totalWanted})`);
  for (const s of r.scenes) {
    if (s.scene > 1) say(s.cutOk, `scene ${s.scene} starts at frame ${s.cut ?? 'no cut found'} (manifest ${s.start}${s.cutOffset ? `, off by ${s.cutOffset}` : ''})`);
    say(s.holdOk, `scene ${s.scene} hold: ${s.holdMeasured} still frames at its end (needs ${s.holdWanted})`);
  }
  if ('audioOk' in r) say(r.audioOk, `soundtrack offset against the narration master: ${r.audioOffsetFrames} frames`);
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(r, null, 1));
  console.log(r.fails ? `\n${r.fails} timing check(s) failed (tolerance ${tolerance} frame${tolerance === 1 ? '' : 's'}).` : '\nTiming matches the manifest.');
  process.exit(r.fails ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });

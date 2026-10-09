// explainer-intake: timing review of a rendered film against its timing manifest.
//   node timing.mjs <video.mp4> <manifest.json> [--audio <narration master.wav>] [--tolerance 1] [--json <report.json>]
//
// The manifest is the one the narration step writes:
//   { "fps": 30, "total_frames": 5400,
//     "segments": [ { "start_frame": 0, "speech_end_frame": 580, "end_frame": 722, "hold_frames": 142 }, ... ] }
// It measures, in frames:
//   - each scene boundary: the first frame near the manifest's start_frame that differs from the held picture before it
//     (a cut or the first frame of a transition); a boundary off by more than --tolerance frames fails;
//   - each hold: how many frames at the end of the scene stay still; fewer than hold_frames - tolerance fails;
//   - the length of the film against total_frames;
//   - with --audio, the offset of the film's soundtrack against the narration master.
// Run it on the clean (uncaptioned) render: a caption that changes during a hold counts as motion.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const W = 240, H = 135;   // the picture is compared at this size: a moving hand or a new label still changes pixels
export const STILL = 12;  // a pixel more than this (of 255) away from the scene's last frame is not settled yet

// Where a scene really starts: the first frame within +-window of `at` that differs from the held frame just before the
// window (a cut, or the first faint frame of a fade). A handful of pixels off by a few levels is encoder noise.
export function findBoundary(frames, at, window = 15, { level = 4, minPixels = 10 } = {}) {
  const ref = frames[Math.max(0, at - window - 1)];
  for (let f = Math.max(1, at - window); f <= Math.min(frames.length - 1, at + window); f++) {
    let c = 0; const a = frames[f];
    for (let k = 0; k < a.length && c < minPixels; k++) if (Math.abs(a[k] - ref[k]) > level) c++;
    if (c >= minPixels) return f;
  }
  return null;
}

// Frames at the end of [start, end) that already look like the scene's last frame: count back from end - 1 while no
// pixel is more than `still` away from it. Comparing with the last frame (not the previous one) catches slow fades and
// ignores one-frame encoder noise.
export function stillTail(frames, start, end, still = STILL) {
  const ref = frames[end - 1];
  let n = 0;
  for (let f = end - 1; f >= start; f--) {
    const a = frames[f];
    let moved = false;
    for (let k = 0; k < a.length; k++) if (Math.abs(a[k] - ref[k]) > still) { moved = true; break; }
    if (moved) break;
    n++;
  }
  return n;
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

export function review(manifest, pictures, { tolerance = 1 } = {}) {
  const segs = manifest.segments, rows = [], frames = pictures.length;
  let fails = 0;
  const lenOk = Math.abs(frames - manifest.total_frames) <= tolerance;
  if (!lenOk) fails++;
  const starts = segs.map((s, i) => (i ? findBoundary(pictures, s.start_frame) : 0));
  segs.forEach((s, i) => {
    const row = { scene: i + 1, start: s.start_frame, end: s.end_frame };
    if (i > 0) {
      const b = starts[i];
      row.cut = b; row.cutOffset = b == null ? null : b - s.start_frame;
      row.cutOk = b != null && Math.abs(row.cutOffset) <= tolerance;
      if (!row.cutOk) fails++;
    }
    const hold = s.hold_frames ?? (s.end_frame - s.speech_end_frame);
    // the scene ends where the next one measurably starts (or at the film's end), so an early change shortens the hold
    const end = Math.min(i + 1 < segs.length ? (starts[i + 1] ?? segs[i + 1].start_frame) : frames, frames);
    row.holdWanted = hold; row.holdMeasured = stillTail(pictures, s.start_frame, end);
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
  const r = review(manifest, frames, { tolerance });
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

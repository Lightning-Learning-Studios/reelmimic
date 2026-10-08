// The timing review, on a small film made with ffmpeg: three 2-second scenes, each moving for 1 second, then still.
//   node --test .claude/skills/explainer-intake/scripts/timing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bestLag, findCut, frameDiffs, readFrames, review, stillTail } from './timing.mjs';

const manifest = (shift = 0) => ({ fps: 30, total_frames: 180, segments: [0, 1, 2].map((i) => ({
  start_frame: i * 60 + (i ? shift : 0), speech_end_frame: i * 60 + 30, end_frame: (i + 1) * 60 + (i < 2 ? shift : 0), hold_frames: 25 })) });

let film;
const diffs = async () => {
  if (!film) {
    film = join(mkdtempSync(join(tmpdir(), 'timing-')), 'film.mp4');
    const scene = (c) => ['-f', 'lavfi', '-i', `color=c=${c}:s=320x180:r=30:d=2`];
    execFileSync('ffmpeg', ['-v', 'error', ...scene('red'), ...scene('blue'), ...scene('green'),
      '-f', 'lavfi', '-i', 'color=c=white:s=40x40:r=30:d=2',
      '-filter_complex', '[3]split=3[b0][b1][b2];' + [0, 1, 2].map((i) => `[${i}][b${i}]overlay=x='min(t*100,100)':y=60[s${i}]`).join(';') + ';[s0][s1][s2]concat=n=3[v]',
      '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', film]);
  }
  return frameDiffs(await readFrames(film));
};

test('a film made to the manifest passes', async () => {
  const r = review(manifest(), await diffs());
  assert.equal(r.frames, 180);
  assert.deepEqual(r.scenes.slice(1).map((s) => s.cutOffset), [0, 0]);
  assert.ok(r.scenes.every((s) => s.holdMeasured >= 29), JSON.stringify(r.scenes));
  assert.equal(r.fails, 0);
});

test('a manifest two frames off fails at the boundaries', async () => {
  const r = review(manifest(2), await diffs());
  assert.deepEqual(r.scenes.slice(1).map((s) => s.cutOffset), [-2, -2]);
  assert.equal(r.scenes.filter((s) => s.cutOk === false).length, 2);
});

test('a hold longer than the still tail fails', async () => {
  const m = manifest(); m.segments[1].hold_frames = 45;
  const r = review(m, await diffs());
  assert.equal(r.scenes[1].holdOk, false);
});

test('the helpers', () => {
  assert.equal(findCut([0, 0, 0, 9, 0, 0], 2), 3);
  assert.equal(findCut([0, 0, 1, 0], 2), null);
  assert.equal(stillTail([0, 50, 50, 3, 0, 0], 0, 6), 4);   // frames 2 to 5 are the same picture (3 is encoder noise)
  assert.equal(bestLag([0, 1, 0, 0, 0], [0, 0, 0, 1, 0], 3), 2);
});

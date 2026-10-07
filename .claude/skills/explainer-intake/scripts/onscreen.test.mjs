// The on-screen rules check, on plans from the three live tests (client names replaced) and on their corrected versions.
//   node --test .claude/skills/explainer-intake/scripts/onscreen.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkRules, parseRules } from './onscreen.mjs';

const plan = (f) => JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', f), 'utf8'));
const edit = (p, id, field, from, to) => {
  const s = p.shots.find((x) => x.id === id), before = JSON.stringify(s[field]);
  s[field] = JSON.parse(before.split(from).join(to));
  assert.notEqual(JSON.stringify(s[field]), before, `fixture edit did not apply: ${from}`);
  return p;
};
const fails = (rules, p) => checkRules(parseRules(rules), p).filter((r) => !r.ok).map((r) => `${r.rule.id} ${r.shot}: ${r.why}`);

const BRIEF = `# A video

## Approved storyboard

| S5 | ... |

## On-screen rules (hard: every rule must hold in plan.json)

- R1 [all] no-count: dots, discs, people, icons | no countable group of people anywhere (S5: a handful of dots, no count shown)
- R2 [S16] no-numerals | the count of proposals in words, never a numeral
- R3 [S15] exactly 2: pins | exactly two map pins
- R4 [S10] never: balance scale | no balance scale in S10
- R5 [S16, S18] show: source line | the source line sits directly under the number

## Brand
`;

test('the rules are read from the brief, one per line', () => {
  const r = parseRules(BRIEF);
  assert.deepEqual(r.map((x) => [x.id, x.kind, x.shots, x.things, x.n]), [
    ['R1', 'no-count', 'all', ['dots', 'discs', 'people', 'icons'], null],
    ['R2', 'no-numerals', ['S16'], [], null],
    ['R3', 'exactly', ['S15'], ['pins'], 2],
    ['R4', 'never', ['S10'], ['balance scale'], null],
    ['R5', 'show', ['S16', 'S18'], ['source line'], null],
  ]);
  assert.equal(r[0].words, 'no countable group of people anywhere (S5: a handful of dots, no count shown)');
});

test('test 1: twelve people drawn after "no count shown" fails; the corrected plan passes', () => {
  const rules = '## On-screen rules\n- R1 [S5, S7] no-count: dots, discs, people, icons | no countable group of people\n';
  assert.deepEqual(fails(rules, plan('test1-twelve-people.plan.json')), [
    'R1 S5: states a count: "12 dots" in "12 dots light gold"',
    'R1 S7: states a count: "12 icon discs" in "now as 12 icon discs in mixed support colours"',
  ]);
  const fixed = plan('test1-twelve-people.plan.json');
  edit(fixed, 'S5', 'action', '12 dots light gold', 'a scattered handful of dots light gold');
  edit(fixed, 'S7', 'action', 'now as 12 icon discs', 'now as an overlapping cluster of icon discs');
  assert.deepEqual(fails(rules, fixed), []);
});

test('test 1: the numeral 12 on the proposals card fails a no-numerals rule; test 3 wrote "a dozen" and passes', () => {
  assert.deepEqual(fails('## On-screen rules\n- R2 [S16] no-numerals | never a numeral\n', plan('test1-twelve-people.plan.json')), ['R2 S16: on-screen text has a numeral: "12"']);
  assert.deepEqual(fails('## On-screen rules\n- R2 [S18] no-numerals | never a numeral\n', plan('test3-kept.plan.json')), []);
});

test('test 2: "no count shown" became 18 dots and fails; the removals it kept pass; the revised plan passes', () => {
  const rules = `## On-screen rules
- R1 [S5, S7] no-count: dots, discs, people | a handful of dots, no count shown
- R2 [S7] never: bar pairs, bar chart | no bar pairs
- R3 [S10] never: balance scale | speech bubbles into one gold check, no balance scale
`;
  assert.deepEqual(fails(rules, plan('test2-eighteen-dots.plan.json')), ['R1 S5: states a count: "about 18 dots" in "about 18 dots turn gold"']);
  const v3 = plan('test2-eighteen-dots.plan.json');
  v3.shots[0] = plan('test2-fixed.plan.json').shots[0];
  assert.deepEqual(fails(rules, v3), []);
  const scale = edit(plan('test2-eighteen-dots.plan.json'), 'S10', 'action', 'the bubbles merge into one gold disc', 'a balance scale tips, then the bubbles merge into one gold disc');
  assert.ok(fails(rules, scale).includes('R3 S10: shows it: "a balance scale tips"'));
});

test('test 3: exactly two pins passes; a third pin fails', () => {
  const rules = '## On-screen rules\n- R3 [S15] exactly 2: pins | exactly two map pins\n- R1 [all] no-count: dots, discs, people, icons | no countable group\n';
  assert.deepEqual(fails(rules, plan('test3-kept.plan.json')), []);
  const three = edit(plan('test3-kept.plan.json'), 'S15', 'action', 'Exactly two pins, no other cities', 'Then three pins pulse');
  assert.deepEqual(fails(rules, three), ['R3 S15: states "three pins", not 2']);
});

test('a rule naming a shot the plan does not have fails', () => {
  assert.deepEqual(fails('## On-screen rules\n- R9 [S99] never: logo | no logo\n', plan('test3-kept.plan.json')), ['R9 S99: the plan has no such shot']);
});

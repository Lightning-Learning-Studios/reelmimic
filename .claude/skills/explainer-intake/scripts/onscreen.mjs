// explainer-intake: the hard on-screen rules from the brief, and the check that a plan's shots keep them.
//
// A rule is one line in the brief's "## On-screen rules" section:
//   - R1 [S5, S7] no-count: dots, people | a handful of dots, no count shown
//   - R2 [S16] no-numerals | the count of proposals in words, never a numeral
//   - R3 [S15] exactly 2: pins | exactly two map pins
//   - R4 [S10] never: balance scale | no balance scale
//   - R5 [S16] show: source line | the source line sits under the number
// [all] applies a rule to every shot. Kinds:
//   never: <things>     none of them is drawn or written in the shot
//   no-numerals         no digit in the shot's on-screen text
//   no-count: <things>  the shot never states a countable number of them (2 to COUNTABLE; one alone is not a group)
//   exactly <n>: <thing> the shot shows the thing, and every number stated for it is n
//   show: <words>       the words appear in what the shot shows
// What a shot shows: summary, action, visual, on_screen, elements, reads, text_overlay, source_line and transitions.
// A mention inside a negated clause ("no bars", "never the numeral 12") is not on screen.

export const COUNTABLE = 30;   // a viewer can count this many in a held shot; a stated number above it reads as "many"
const SHOWN = ['summary', 'action', 'visual', 'on_screen', 'elements', 'reads', 'text_overlay', 'source_line', 'transition_in', 'transition_out'];
const NEG = /\b(no|not|never|without|none|nothing|avoid|instead of|rather than|don't|do not|nor)\b/i;
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, 'a dozen': 12, dozen: 12, 'a pair of': 2, 'a couple of': 2 };
const NUM = `(\\d+|${Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|')})`;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plural = (w) => `${esc(w.replace(/(es|s)$/i, ''))}(?:e?s)?`;
const value = (n) => (/^\d+$/.test(n) ? Number(n) : WORDS[n.toLowerCase()]);

export function parseRules(brief) {
  const sec = (String(brief).split(/^## /m).find((s) => /^On-screen rules/i.test(s)) || '');
  const rules = [];
  for (const line of sec.split('\n')) {
    const m = line.match(/^\s*[-*]\s*(R\d+)\s*\[([^\]]+)\]\s*([^|]+?)\s*(?:\|\s*(.*))?$/);
    if (!m) continue;
    const [, id, where, spec, words = ''] = m;
    const shots = /^\s*all\s*$/i.test(where) ? 'all' : where.split(',').map((s) => s.trim()).filter(Boolean);
    const k = spec.match(/^(never|no-numerals|no-count|exactly\s+(\d+)|show)\s*(?::\s*(.*))?$/i);
    if (!k) { rules.push({ id, shots, kind: 'unknown', spec, words }); continue; }
    const kind = k[1].toLowerCase().startsWith('exactly') ? 'exactly' : k[1].toLowerCase();
    rules.push({ id, shots, kind, n: k[2] ? Number(k[2]) : null, things: (k[3] || '').split(',').map((s) => s.trim()).filter(Boolean), words: words.trim(), spec: spec.trim() });
  }
  return rules;
}

const flat = (v) => (v == null ? [] : typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(flat) : typeof v === 'object' ? flat(v.text ?? v.what ?? v.label ?? Object.values(v).filter((x) => typeof x === 'string')) : []);
// the shot's on-screen description, cut into clauses (decimals like 2.6 stay whole)
const clauses = (shot) => SHOWN.flatMap((f) => flat(shot[f])).join('\n').split(/(?<!\d)[.;!?](?!\d)|[\n()]|,\s|:\s|\s+-\s+/).map((c) => c.trim()).filter(Boolean);
// matches of re in a clause that no negation word comes before
const shown = (clause, re) => [...clause.matchAll(new RegExp(re, 'gi'))].filter((m) => !NEG.test(clause.slice(0, m.index)));
// a number, not a time, size or part of a decimal ("1.5 s a white pin" states no count of pins)
const UNIT = '(?!\\s*(?:s|ms|secs?|seconds?|px|%|fps|x|by|to)\\b)';
const counts = (cl, thing) => cl.flatMap((c) => shown(c, `(?<![\\d.])\\b(?:about |around |roughly |exactly |some |nearly |over )?${NUM}\\b${UNIT}\\s+(?:[a-z-]+\\s+){0,3}?${plural(thing)}\\b`).map((m) => ({ n: value(m[1]), text: m[0], clause: c })));
const overlayText = (shot) => [...flat(shot.text_overlay), ...['summary', 'action', 'reads'].flatMap((f) => flat(shot[f])).flatMap((t) => [...t.matchAll(/"([^"]+)"|“([^”]+)”/g)].map((m) => m[1] || m[2]))];

// One result per rule and shot it applies to: { rule, shot, ok, why }
export function checkRules(rules, plan) {
  const shots = plan.shots || [], out = [];
  for (const r of rules) {
    const targets = r.shots === 'all' ? shots : r.shots.map((id) => shots.find((s) => s.id === id) || { id, missing: true });
    for (const s of targets) {
      const res = (ok, why = '') => out.push({ rule: r, shot: s.id, ok, why });
      if (s.missing) { res(false, 'the plan has no such shot'); continue; }
      const cl = clauses(s);
      if (r.kind === 'unknown') res(false, `cannot check "${r.spec}"`);
      else if (r.kind === 'never') {
        const hit = r.things.flatMap((t) => cl.flatMap((c) => shown(c, `\\b${plural(t)}\\b`).map(() => c)));
        res(!hit.length, hit.length ? `shows it: "${hit[0]}"` : '');
      } else if (r.kind === 'no-numerals') {
        const hit = overlayText(s).filter((t) => /\d/.test(t));
        res(!hit.length, hit.length ? `on-screen text has a numeral: "${hit[0]}"` : '');
      } else if (r.kind === 'no-count') {
        const hit = r.things.flatMap((t) => counts(cl, t)).filter((c) => c.n >= 2 && c.n <= COUNTABLE);
        res(!hit.length, hit.length ? `states a count: "${hit[0].text}" in "${hit[0].clause}"` : '');
      } else if (r.kind === 'exactly') {
        const t = r.things[0] || '', all = counts(cl, t), wrong = all.filter((c) => c.n !== r.n);
        const present = cl.some((c) => shown(c, `\\b${plural(t)}\\b`).length);
        res(present && !wrong.length, !present ? `does not show any ${t}` : wrong.length ? `states "${wrong[0].text}", not ${r.n}` : '');
      } else if (r.kind === 'show') {
        const phrase = r.things.join(', ');
        res(cl.some((c) => shown(c, `\\b${esc(phrase)}`).length), `does not show "${phrase}"`);
      }
    }
  }
  return out;
}

// The rule ids a plan copied into each shot (shot.rules: ["R1", ...] or [{ id: "R1", ... }])
export const copiedRules = (shot) => (shot.rules || []).map((x) => (typeof x === 'string' ? x.match(/^R\d+/)?.[0] : x?.id)).filter(Boolean);

---
name: explainer-intake
description: Front door for a concept-first explainer video. Takes any mix of a concept, a script, a storyboard, a document, a pasted Linear card, an evidence list, an example video and a brand folder; turns them into one intake file; asks only for what is missing; holds evidence, script and storyboard approvals with a source for every claim; then hands the job to reelmimic and opens plan review. Use when someone types /explainer-intake, or says "make an explainer about X", "start a video from this script / storyboard / concept", or "explainer intake".
---

# explainer-intake

```
/explainer-intake [--concept <file or text>] [--script <file>] [--storyboard <file>] [--doc <file>]
                  [--linear <pasted card text file>] [--evidence <file>] [--example <video or file>]
                  [--brand <folder with DESIGN.md and logo>] [--out <project folder>] [--stop-before-production]
```

You turn whatever the person brings into an approved script and storyboard, then hand them to reelmimic, which analyses the example video, writes its plan, paints style frames and waits for the person at plan review. You never render, and you never call a voice, music or image model.

Write in plain English, short sentences, no em dashes or en dashes. Use the client's own terms.

## Files

Everything lives in the `--out` folder (default `projects/intake-<short-name>/`).

| File | What it is |
|---|---|
| `intake/sources/` | Every input exactly as given, plus a dated copy of each web page you quote. Never edited. |
| `intake/intake.md` | The one intake file (template: `intake.template.md` here). Every later step reads it. |
| `intake/interview.md` | Each question as asked, and the answer word for word. |
| `intake/evidence.md` | One row per claim, each with a source. |
| `intake/script.md` | Narration, one line per row, each line tagged with claim ids. |
| `intake/storyboard.md` | Shots with timing, what is on screen, narration and claims. |
| `intake/GATES.md` | `evidence: Approved by <name> <date>` or `Changes needed: <why>`, one line per gate, plus history. |
| `handoff/` | `brief.md` and `handoff.json` for reelmimic (see Step 7). |
| `intake/reelmimic.json` | Written by `register.mjs`: the reelmimic project id and folder. |

On every start, read `intake/GATES.md` if it exists and resume at the first gate that is not Approved. Files decide where you are, not memory.

## Step 0. Check the machine and the brand

1. Run `node .claude/skills/explainer-intake/scripts/register.mjs doctor`. It says in one line if Node is older than 22.18 and how to fix it.
2. The brand folder must hold a `DESIGN.md` (design.md format, tokens in the frontmatter) and a logo file. Fonts are optional. If there is no brand folder, ask for one. Never invent a palette.

## Step 1. Read every input into one intake file

Copy each input to `intake/sources/`, then fill `intake/intake.md`.

| Input | How to read it |
|---|---|
| `--concept` | The title and purpose. Pull out audience, length, destination, the client's terms. |
| `--doc` | Its thesis is a `message` candidate. Every fact, number or quote becomes an evidence candidate with page or section. |
| `--linear` | Title is the concept, description is notes, acceptance criteria become `must_show`, links become evidence candidates, assignee and reviewers become approvers. |
| `--script` | Copy to `intake/script.md`, every line marked `given`. Ask once: word for word, or may we change it? |
| `--storyboard` | Rows become shots marked `given`; its narration becomes the script; its look notes go to the conflict check. Say which version and timing you read, and flag shot times that disagree with its notes. |
| `--evidence` | Rows go straight into `evidence.md`. |
| `--example` | A video is learned for pacing, layout and transitions only. A written example is learned for structure. Ask what to keep and what not to copy. |

When inputs disagree, the higher one wins: (1) what the person says now, (2) the brand file, for look, (3) the concept, for purpose and terms, (4) the evidence, for facts, (5) a given script, for words, (6) a given storyboard, for structure, (7) the example, for pacing. When two brand sources disagree (for example the website and a design file), ask. Log every conflict in the intake's `## Conflicts` table.

## Step 2. Interview for what is missing

Ask only what the inputs did not answer. Use AskUserQuestion with 2 to 4 options, your recommendation first with a short reason. Group the quick factual ones (length, destination, voice, approvers) into one AskUserQuestion call with several questions. An inference is not an answer: ask, with the inference as the recommendation. Write every question and answer to `intake/interview.md`.

1. The one thing a viewer should understand after watching (message).
2. Who is watching and what they already know (audience).
3. Where it plays: website, social feed or phone (sets 16:9, 1:1 or 9:16), and how long.
4. Look: flat 2D infographic or whiteboard; characters, simple icon people, or no people at all.
5. The brand folder, and whether the logo and font files in it are the ones to use. If the logo is missing, ask for it now, not at approval.
6. The example: what to keep, what not to copy.
7. Sources: files, links, quotes or a named person behind the claims.
8. The script: word for word, or may we change it? The storyboard, if any.
9. Narration: who narrates (a named voice, a recording, or a draft voice), and accent.
10. Must show exactly; must never appear.
11. Who approves the evidence, the script, the storyboard and the cut.

Close with one integration check (for example "120 s with 10 claims is about 12 s a claim") and a summary in two groups: what the person said, and what you inferred. Show it again if corrected.

## Step 3. Find sources

Before the evidence gate, look for a source for every factual line:

1. The files the person gave.
2. The client's own website: fetch the pages, save a text copy with its URL and the date to `intake/sources/web/`, and quote it exactly.
3. A knowledge graph or research folder, if one is connected.
4. Anything still missing: ask the person, or mark it `needs_source`.

A quote taken second hand (from notes about a report, not the report) is marked `second hand` and must be checked against the original before the script gate.

## Step 4. Evidence gate

Write `intake/evidence.md`:

`| id | claim | status | source (file, page or URL) | exact quote | read on |`

Status is `sourced`, `second hand`, `needs_source`, `framing` (a metaphor or slogan) or `opinion`. Never invent a number. Ask: **Approved** or **Changes needed**. Write the answer to `GATES.md`.

## Step 5. Script gate

Write `intake/script.md`: one narration line per row with its claim ids, at about 150 words a minute. Keep a given script word for word unless the person allowed changes; still fix the client's terms and banned words, and log each fix. Do not show the script for approval while any line rests on a `needs_source` claim: cut it, rewrite it to what the evidence says, or get a source. Ask: **Approved** or **Changes needed**.

## Step 6. Storyboard gate

Write `intake/storyboard.md`: one row per shot with id, start and end seconds, what is on screen, the narration line, the claim ids, and the source line shown under any number. Use the brand file's own colour and type names. With no characters, say what stands in for people (icons, silhouettes, maps). Timing comes from word counts: say so. Ask: **Approved** or **Changes needed**.

When it is approved, write the on-screen rules into `intake/storyboard.md` under `## On-screen rules`, one per line: every on-screen "must" and "must not" in the approved storyboard, and every change the person asked for at this gate (each "Changes needed" item about what is on screen becomes at least one rule; check `GATES.md` history so none is missed). Each rule names its shots (or `all`), one check, and the person's own words:

`- R1 [S5] no-count: dots, discs, people | a handful of dots, no count shown`

| Check | Use it for | Fails when |
|---|---|---|
| `never: <things>` | "no balance scale", "no party colours" | a shot draws or writes one of them (a mention after "no" or "never" is fine) |
| `no-numerals` | "a dozen in words, never 12" | the shot's on-screen text has a digit |
| `no-count: <things>` | "no count shown", "never a countable group" | the shot states a number from 2 to 30 of them ("12 dots", "about 18 dots") |
| `exactly <n>: <thing>` | "exactly two map pins" | the thing is missing, or another number of it is stated |
| `show: <words>` | "the source line under the number" | the words are not in what the shot shows |

Name things the way a plan would draw them (`bar chart`, not `bar`, which also matches a "bar wipe"). A soft wish ("a handful", "too many to count") is still a rule: write it as `no-count`. Show the rules with the storyboard at its gate.

## Step 7. Hand off to reelmimic

Do not hand off while any of your own questions is open. Every question you could not settle (from the interview, a conflict, a `needs_source` you kept, a gate) goes under `## Open questions` in `intake/intake.md` as `- [ ] <question>`. Each one ends as `- [x] <question>: <answer>` or, when the person says it needs no answer, `- [dismissed by <name>: <reason>] <question>`. `register.mjs start` refuses while any `- [ ]` line is left and lists them.

1. Write `handoff/brief.md` from `brief.template.md` here. It carries the approved script word for word, the approved storyboard, the on-screen rules word for word, the brand-wins rule, the claims rule, the client's terms, and the planning limits (no voice, music or image generation before approval).
2. Write `handoff/handoff.json`. Every key is required (`register.mjs` stops and names any that is missing):
   `{ "title": "...", "lang": "en", "agent": "claude", "server": "http://localhost:4318", "reference": "<example video path, or null>", "brand": "<the brand folder's DESIGN.md>", "logo": "<the logo file>", "inputs": ["<brand DESIGN.md>", "<logo>", "<fonts>", "intake/script.md", "intake/storyboard.md", "intake/evidence.md"] }`
   `server` is the reelmimic address the person uses; `brand` and `logo` drive the brand colour, font and logo checks.
3. With no example video, also write `handoff/plan.json` and `handoff/STORYBOARD.md` in reelmimic's format (`.claude/skills/video-clone/CONTRACT.md`), with `ref_shot: null`, `claims` on every shot and a top-level `evidence` list.
4. Start reelmimic if it is not running: `./start.sh` (Windows: `start.bat`). Then run
   `node .claude/skills/explainer-intake/scripts/register.mjs start <out>`.
   With an example video it creates the project through reelmimic's own front door, so reelmimic analyses the example, writes its plan from the brief and paints the style frames. Without one it registers the project at plan review and asks reelmimic to paint style frames only.
5. Wait for plan review: `register.mjs watch <out>` prints each stage and the link to open.
6. Run `register.mjs check <out>`: it checks that the plan keeps the approved narration, every on-screen rule (shot by shot), the claims, the brand colours and fonts, and the banned words. Show the person what failed. A failed on-screen rule goes back to reelmimic as a chat message naming the rule and the shot, before the person approves.

## Step 8. Plan review

Tell the person: open the link, look at the plan and the style frames, and send changes in the chat on the right.

Then read the plan's open questions (`register.mjs watch` prints them at plan review). reelmimic refuses Approve while any is open. Ask the person each one with AskUserQuestion. Send each answer in the plan chat, so the director records it with the question; or, when the person says a question needs no answer, have them click **Dismiss** next to it and give their name and the reason. Only when none is open, tell them to click **Approve and start**. Never tell the person to approve past an open question.

With `--stop-before-production`, run `register.mjs watch <out> --stop-at-production` before the person approves. The moment production starts it stops the job with reelmimic's own Cancel, so nothing is rendered.

## Rules

- Every number on screen or in narration traces to an evidence row.
- Never edit reelmimic's own files; write only in `--out` and through `register.mjs`.
- Keep messages to the person short: where you are, and what you need.

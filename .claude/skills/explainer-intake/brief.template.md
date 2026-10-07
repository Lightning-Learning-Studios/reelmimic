# <title>

Made with explainer-intake. The script and the storyboard below were approved by <approver> on <date>. Plan from them; do not rewrite them.

## The request

- What: a <length> explainer, "<title>", for <audience>.
- Where: <destination>, <width>x<height>, captions always on. Language: <language>.
- Message: <message>
- Tone: <tone>
- Narrator: <voice>. The voice is recorded after approval; do not make a draft voice.

## Approved script (use word for word)

<the script lines, one per line, each followed by its claim ids in brackets>

## Approved storyboard (keep the shots, their order and their content)

<the storyboard table>

You may sharpen camera moves, transitions and layout to follow the example video's technique, and adjust shot lengths by up to 20 percent. Anything bigger goes in open_questions.

## Brand (wins over the example video)

- The brand file is `inputs/<DESIGN.md>`. It wins over the example video on colour, type, illustration, motion, captions and logo. Fill `plan.look.palette` and `plan.look.typography` from its tokens, word for word.
- Logo: `inputs/<logo file>`. Fonts: <font files in inputs/>. Declare them with @font-face.
- People: <characters | simple icon people | no people>. <what stands in for people>

## Claims (every fact has a source)

- Every factual line has a claim id from `inputs/evidence.md`. Copy them into each shot as `claims: [{ "id": "E1", "text": "..." }]` and put the evidence rows in a top-level `evidence` list.
- Every number on screen shows a short source line under it. Never invent or round a number.
- Use these terms: <terms>. Never use: <words_never>.

## Planning limits (before approval)

- Do not generate narration, a draft voice, music, sound effects or images with any model or text to speech service. Time the shots from the storyboard.
- Do not fetch music or sound effects now. List them in `plan.assets` with status `deferred`.
- Style frames are drawn in code (HyperFrames) with the brand fonts and the logo.

## Example video

Learn only its technique: pacing, how numbers and maps build with the voice, transitions, caption placement. Do not copy its words, colours, fonts, logo or characters. Map each shot to a reference shot in `ref_shot` and `ref_what`.

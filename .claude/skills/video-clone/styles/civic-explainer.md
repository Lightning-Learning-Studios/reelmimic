---
name: civic-explainer
engine: hyperframes
medium: 2d-vector
priority: 75
---
# Civic explainer (calm, evidence-led, on a client's brand)

Added by Lightning Learning Studios with the explainer-intake skill. Projects that use it usually start from an approved script and storyboard, with or without an example video.

## Recognition traits
- Picture: flat 2D infographics, maps, charts, simple icon people, big plain headlines, one idea per scene
- Cutting: follows the narration at a medium pace; holds of at least 2.5 s after a statement lands
- Sound: one narrator plus a quiet music bed
- Text: captions always on; a short source line under every number

## Production defaults
- Go through `/hyperframes` then `/faceless-explainer`.
- The client's brand file (`DESIGN.md` or `frame.md` in `inputs/`) wins over any example video on colour, type, illustration, motion, captions and logo. Copy it into the HyperFrames project root as `frame.md`.
- The approved script in `brief.md` is the narration, word for word. The approved storyboard sets the shots and their order.
- Every number and fact on screen comes from `plan.json` `evidence`. No invented or rounded figures.
- People are drawn the way the brief and the brand file say. When the brief says no characters, use icons, silhouettes, maps and charts, and skip `vector_rig`.
- If `inputs/NO_REFERENCE.md` exists there is no example video: skip compare.py and judge against `STORYBOARD.md` and the brand file.
- Calm motion: ease-out entrances, no bounce, shake, whip pans or flashes.

## Known pitfalls
- A wipe in the ground colour over the same ground is invisible; seams use an accent colour.
- Captions must sit above every wipe layer.
- Declare `@font-face` in every sub-composition or HyperFrames `check` fails.
- Party or team colours appear only in equal pairs, each labelled in words.

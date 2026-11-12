# Handover

## Status

Playable Quoridor on the open-source-hands game starter: 9×9, ten fences each, orthogonal steps, straight jumps, diagonal jumps, fence overlap, crossing, and a path check for both pawns. Versus a heuristic, or two people on one machine. Camera, mouse, touch and keyboard all meet in one hand. A bot plays through the real gesture engine.

## What works, and how it was verified

- `npm test`: 28 tests. Movement, straight and diagonal jumps, overlap, crossing, a T-junction, a fence that seals one pawn, the grab latch (including a hand that disappears), palm-roll hysteresis, the heuristic (opening step, a win, a last-rank block, a full game that ends), and pinch / fist / open palm / roll from synthetic hands, left and right.
- `npx tsc --noEmit` passes.
- `npm run mouse` against the dev server: drag the pale pawn one square, place a fence, turn it with R, turn it back with the right button. No console errors.
- `npm run capture`: the bot plays a game (it misses once on purpose), the machine wins in 24 moves, the bot pinches to restart. No console errors and no `GL_INVALID`. Screenshots in `captures/` were looked at, including a phone-sized board.
- `npm run loud` while the bot plays: p90 −30.1 dBFS, peak −22.9 dBFS.

## Not verified

- A real webcam, by a person. Only synthetic hands and the pointer drove it.
- Listening by ear. The loudness numbers above are from the analyser, not from speakers.
- A real phone, Safari, or Firefox. The phone check was a 390×844 headless viewport.
- 60 fps at device pixel ratio 2. This machine's Chrome renders with llvmpipe (software). Measured about 18 fps at DPR 1 and about 5 fps at DPR 2, with zero `GL_INVALID`. The scene is one shadow light, a board, two pawns and the fences; a real GPU was not available to confirm 60.

## Tuning knobs

| Constant | File | What it does |
| --- | --- | --- |
| `PINCH_ON`, `PINCH_OFF` | `src/pinch.ts` | pinch press / release |
| `GRAB_HOLD_S`, `CARRY_MIN_S`, `RELEASE_HOLD_S`, `LOST_GRACE_S`, `OPEN_PALM` | `src/grab.ts` | how long a fist or pinch must hold, how long a carry lasts before an open palm counts, how open the palm must be |
| `ROLL_TO_H`, `ROLL_TO_V` | `src/grab.ts` | palm-roll dead zone for fence orientation |
| fence cap (`spent >= 2`) | `src/ai.ts` | the machine blocks at most twice, and only when the other pawn would finish next turn |
| `REGION` | `src/input.ts` | the part of the camera image that maps onto the screen |
| pawn radius 0.52, cell snap 0.72, slot snap 0.78 | `src/scene.ts` | how generous a grab and a drop are |
| master gain 1.05 | `src/audio.ts` | overall loudness |

## Design decisions and why

- Rules stay in grid cells, with no three.js, so the tests and the bot can run them. The scene turns a screen point into a cell with a ray onto the board plane.
- Mouse, touch and the bot are synthetic landmarks through the real engine. There is one grab latch.
- An open palm places the piece. Releasing a pinch without opening the hand does not, because a pinch wobbling near the threshold was dropping pieces.
- A refused drop puts the piece back and does not spend the turn.
- The machine walks a shortest path and spends at most two fences, both of them to stop a pawn that would score next turn. A wider search made games that never finished; two blocks still punish a naked race.
- Stacks sit beside the board on a wide screen and on the baselines on a tall one, so a phone can still reach its fences.
- No post-processing. The shadow map is marked dirty once at setup.

## Gotchas

- While the left button is down, Chromium does not deliver a right-button `pointerdown`. It delivers `contextmenu` only. `src/input.ts` turns the fence from that, and ignores the menu when the pointer event already counted.
- `features.roll` is updated only while a fence is in the hand, and only for the camera and the bot. A mouse hand is built with roll 0, which would otherwise pin every fence to vertical.
- The bot's first carry is a deliberate miss, so the red preview and the refusal get exercised. It then plays the heuristic.
- Headless frame times on llvmpipe are not the game's frame times on a GPU.

## Progress log

- 2026-11-12: started from `templates/game` in abouchedidxcode/open-source-hands. Replaced the rules, the scene and the sound. Kept the kit, the input path, the bot pattern and the tools.

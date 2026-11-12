# Quoridor

步步为营. A 9×9 board, two pawns, ten fences each. Walk to the far rank, or set a fence so the other pawn has to go the long way. One hand is enough: pinch or close it to pick a piece up, open the palm to put it down, tilt the palm to turn a fence.

It is a webcam game, and the same game with a mouse, a finger, or the keyboard. The picture from the camera never leaves the machine.

```bash
npm install
npm run dev          # http://127.0.0.1:43123  (the camera needs localhost or https)
```

The first run downloads the MediaPipe hand model into `public/models` and copies the matching wasm into `public/wasm`.

## How to play

| Action | Hand | Mouse / touch | Keyboard |
| --- | --- | --- | --- |
| Aim | move an open hand; the dot follows the palm | move the pointer | |
| Pick up your pawn or a fence from your stack | pinch, or make a fist, and hold it a moment | press and hold | |
| Put it down | open the palm | let go | |
| Turn a fence | tilt your palm while you hold one | the **Fence is…** button | right-click or R |
| Start / play again | pinch on the results card | click a button | Space |
| Mute | | | M |

A green ghost is a legal square or a legal fence. A red one is refused, including a fence that would wall either pawn off from its goal. Only your own pawn and your own stack can be picked up, and only on your turn.

**Versus the machine** is the pale pawn against a short heuristic. **Two on this machine** passes the same hand back and forth.

## Commands

```bash
npm run dev          # dev server
npm test             # vitest: rules, grab latch, heuristic, gesture recognition
npm run build        # type-check, then build to dist/
npm run mouse        # with the dev server up: drag a pawn, place a fence, turn it
npm run capture      # with the dev server up: the bot plays a game; screenshots in captures/
npm run capture -- mobile
npm run fps          # frame rate while the bot plays
npm run loud         # loudness while the bot plays
```

Playwright needs a browser the first time: `npx playwright install chromium`.

## URL flags and test hooks

| Flag | Effect |
| --- | --- |
| `?bot=1` | a synthetic player takes the pale pawn, through the real gesture engine |
| `?autostart=1` | skip the title (mouse) |
| `?mute=1` | no sound |
| `?mode=hotseat` | two people on this machine |
| `?speed=K` | run the game K times faster |

`window.__game` returns `{ phase, mode, turn, winner, moves, pawns, remaining, fences, holding, input, hand, fps, dpr, best }` plus `cell(c, r)`, `slot(c, r)` and `stock(player)` in screen space. The capture tool and `tools/mouse.mjs` read it.

## Files

| File | Owns |
| --- | --- |
| `src/main.ts` | Wiring: input → rules → scene and sound, title and results, flags, `window.__game` |
| `src/rules.ts` | The board, with no DOM: steps, jumps, fence overlap, crossing, and a path for both pawns |
| `src/grab.ts` | Pinch and fist → a carry; an open palm → a placement. Palm roll → fence orientation |
| `src/ai.ts` | The machine: walk a shortest path, and spend a fence when the other pawn is about to finish |
| `src/input.ts` | Camera, mouse, touch and bot all become one hand |
| `src/pinch.ts` | Pinch strength → press / release, with hysteresis |
| `src/bot.ts` | The synthetic player used by `?bot=1` |
| `src/scene.ts` | three.js: the table, the board, the pawns, the stacks. A ray from the palm onto the board |
| `src/audio.ts` | Procedural knocks. No audio files |
| `src/style.css` | Title, HUD, the line drawing of the pinch |
| `src/hand-gesture-kit/` | The kit, copied unmodified. Configure it; don't edit it |
| `tests/` | Rules, the grab latch, the heuristic, and the gestures the game asks for |
| `tools/` | `capture.mjs`, `mouse.mjs`, `fps.mjs`, `loud.mjs` |

## How the gestures stay deliberate

The kit tracks the hand and smooths it. This game reads the palm centre through `toScreen` (so you never have to reach the edge of the camera picture), the pinch, the pose, and `features.roll`.

Picking a piece up takes a pinch at or above 0.6, or a fist, held for about 120 ms. Letting go of the pinch does not drop the piece: the palm has to open (pinch at or below 0.35, fingers extended) and the piece has to have been carried for about 180 ms. A hand that vanishes mid-carry waits, then cancels, instead of dropping the piece on the last good frame. Values between the two pinch thresholds do not flap. Illegal drops are refused and the piece goes back.

A held fence follows the palm roll, with a dead zone so it does not flicker between horizontal and vertical. Mouse and touch ignore roll (a resting hand reads as vertical) and use right-click, R, or the on-screen button. While a button is held down, the browser often skips the right-button pointer event and only fires the context menu; that menu turns the fence too, and a plain right-click is not counted twice.

`REGION` in `src/input.ts` is the part of the camera image that maps onto the screen.

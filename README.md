# Quoridor

步步为营. A 9×9 board, two pawns, ten fences each. Walk to the far rank, or set a fence so the other pawn has to go the long way. One hand is enough: pinch the thumb and index finger to pick a piece up, separate them to put it down, aim along a horizontal or vertical gap to turn a fence.

It is a webcam game, and the same game with a mouse, a finger, or the keyboard. The picture from the camera never leaves the machine.

```bash
npm install
npm run dev          # http://127.0.0.1:43123  (the camera needs localhost or https)
```

The first run downloads the MediaPipe hand model into `public/models` and copies the matching wasm into `public/wasm`.

## How to play

### Online rooms

Choose **Online duel → Create a room**, then share its invite link or six-character room code. The host plays Moon White and the guest plays Jade Green. Both players see their own pawn at the near side of the board. At the start of every game, including a rematch, a ceremonial coin flips above the center of the board to decide whether Moon White or Jade Green moves first (and who goes second). A rare edge-stand re-flips automatically.

**Use camera** and **Mouse or touch** are two explicit, mutually exclusive control choices with a selected mark. Selecting one does not start or prepare a game. Choose your controls, then press **Ready** (or **Start game** for local play). Camera failure leaves Ready/Start unavailable until you retry or select mouse. **Cancel ready** lets you change controls before the round begins. Each can control only their chosen color, on their own turn. The two camera feeds stay local. Single-player and same-device games use the same separate control-selection/start flow, and the same opening coin toss.

The room pauses submissions when either player disconnects. Keep the same tab open: refreshing or a temporary connection failure restores the seat and authoritative board automatically. Credentials live in that tab's sessionStorage, not in the invite link. Closing the tab or clearing its storage may lose the seat; open another room in that case. On results, both players choose **Play again** before the next round starts. Leaving disconnects the player but retains the reserved seat for reconnection.

Moon White and Jade Green have mirrored elapsed-time displays (`MM:SS`). Only the player whose turn it is accumulates time; these are count-up clocks, with no time-limit loss. Online clocks are server-authoritative, pause when either player disconnects, and reset for a mutual rematch. Refreshing restores the saved room time. An unexpected service restart resumes from its last persisted clock checkpoint rather than charging server downtime. AI and same-device games use local clocks.

Local room development (Node 22 or newer):

```bash
npm install
npm run build       # supplies dist/ and self-hosted camera assets
npm run dev:rooms   # terminal 1: Cloudflare runtime, http://[::1]:8787
npm run dev         # terminal 2: game, http://127.0.0.1:43123
npm run test:rooms  # real HTTP/WebSocket service regression
```

Open the game in two separate tabs to test both seats. Vite proxies `/api` including WebSocket upgrades to the local room service. IPv6 loopback avoids the observed Windows Wrangler IPv4 proxy hang. Single-player still works without the room service.

Cloudflare deployment uses **Workers Static Assets + a SQLite Durable Object per room** in one origin; a static-only Pages upload cannot run rooms. After signing in to the intended Cloudflare account:

```bash
npx wrangler login
npm run deploy
```

The deploy script builds/types-checks both parts, uploads the public game assets and Worker code, and applies the `v1` Durable Object migration in `wrangler.jsonc`. No API key is embedded in the frontend. Hosting can start within Cloudflare's free tier; account eligibility and current quotas must be checked at deployment.

The [GitHub Pages version](https://aurvallab.github.io/quoridor-3d/) is deployed by GitHub Actions on pushes to `main`. It uses the Cloudflare Worker for online rooms; the Worker accepts cross-origin room requests only from the GitHub Pages origin. Both services must be available for online play.

| Action | Hand | Mouse / touch | Keyboard |
| --- | --- | --- | --- |
| Aim | move your hand; the dot stays stable while the fingers close | move the pointer | |
| Pick up your pawn or a fence from your stack | pinch thumb and index finger over the piece | press and hold | |
| Put it down | separate thumb and index finger | let go | |
| Turn a fence | aim along the horizontal or vertical gap | drag along a gap; right-click also rotates | R |
| Switch angled / top view | | the **Top view / Angled view** button | V |
| Start / play again | pinch on the results card | click a button | Space |
| Mute | | | M |

A green ghost is a legal square or a legal fence. A red one is refused, including a fence that would wall either pawn off from its goal. Only your own pawn and your own stack can be picked up, and only on your turn.

The default view looks down at 50°, pulled back slightly with more table visible below the board. Top view looks straight down with your baseline still at the bottom. Switching views keeps the game and cancels any carry without spending a turn; open your fingers before picking up again.

**Versus the machine** is the pale pawn against a short heuristic. **Two on this machine** passes the same hand back and forth.

## Commands

```bash
npm run dev          # dev server
npm test             # vitest: rules, grab latch, heuristic, gesture recognition
npm run build        # type-check, then build to dist/
npm run mouse        # with the dev server up: drag a pawn, place a fence, turn it
npm run pinch        # with the dev server up: synthetic two-finger pickup, release and cancellation
npm run mouse -- --top  # the same pointer checks in top view
npm run pinch -- --top  # the same synthetic camera checks in top view
npm run capture      # with the dev server up: the bot plays a game; screenshots in captures/
npm run capture -- mobile
npm run fps          # frame rate while the bot plays
npm run loud         # loudness while the bot plays
```

Playwright needs a browser the first time: `npx playwright install chromium`. Alternatively set `CHROMIUM_PATH` to an installed Chrome executable for `mouse`, `pinch` and `capture`.

## URL flags and test hooks

| Flag | Effect |
| --- | --- |
| `?bot=1` | a synthetic player takes the pale pawn, through the real gesture engine |
| `?autostart=1` | skip the title (mouse) |
| `?mute=1` | no sound |
| `?mode=hotseat` | two people on this machine |
| `?speed=K` | run the game K times faster |

`window.__game` returns `{ phase, mode, turn, winner, moves, pawns, remaining, fences, holding, input, view, hand, fps, dpr, best }` plus `cell(c, r)`, `slot(c, r)` and `stock(player)` in screen space. The capture tool and `tools/mouse.mjs` read it.

## Files

| File | Owns |
| --- | --- |
| `src/main.ts` | Wiring: input → rules → scene and sound, title and results, flags, `window.__game` |
| `src/rules.ts` | The board, with no DOM: steps, jumps, fence overlap, crossing, and a path for both pawns |
| `src/grab.ts` | Pinch → a carry; separating the fingers → a placement. Palm roll for the synthetic bot |
| `src/ai.ts` | The machine: walk a shortest path, and spend a fence when the other pawn is about to finish |
| `src/input.ts` | Camera, mouse, touch and bot all become one hand |
| `src/hand-pointer.ts` | Geometric pinch detection and a palm-local grip point, based on GODHAND’s interaction method |
| `src/pinch.ts` | Pinch strength → press / release, with hysteresis |
| `src/bot.ts` | The synthetic player used by `?bot=1` |
| `src/scene.ts` | three.js study scene, beveled board/pieces, board projection, and gap-based fence orientation |
| `src/study-props.ts` | Static tea set, plant, books, pen, candelabra, mantel clock and pocket watch; outside input targets |
| `src/study-room.ts` | Walnut games table, opposing leather chairs, rug and floorboards |
| `src/static-meshes.ts` | Batches static furniture and prop meshes by material and shadow flags |
| `src/fence-box.ts` | Low slotted coffers, fixed stock slots and responsive rack layout |
| `src/reference-scene.ts` | Interactive image-based angled scene using the supplied artwork and independent pieces |
| `src/reference-projection.ts` | Calibrated board homography and photographed stock hit areas |
| `src/audio.ts` | Procedural knocks. No audio files |
| `src/style.css` | Title, HUD, the line drawing of the pinch |
| `src/hand-gesture-kit/` | The kit, copied unmodified. Configure it; don't edit it |
| `tests/` | Rules, the grab latch, the heuristic, and the gestures the game asks for |
| `tools/` | `capture.mjs`, `mouse.mjs`, `fps.mjs`, `loud.mjs` |

## How the gestures stay deliberate

The kit tracks and smooths landmarks. The camera pointer uses the interaction method observed in [GODHAND inside Show of Hands](https://meticulai.com/games/show-of-hands/games/godhand/index.html): the thumb/index gap is divided by palm size, starts a pinch below 0.28 and keeps it until the gap exceeds 0.42. Fingertip-versus-joint contact and index reach reject a fist without requiring a named pose.

As the fingers approach, the grip offset is held in the palm’s local frame. Moving, rotating or scaling the palm still moves the cursor, while closing the fingertips alone does not pull it away from a piece. The already-smoothed landmarks are used directly; there is no second cursor filter. Mouse/touch/bot positions remain directly anchored to their requested screen point.

A valid pinch over your own pawn or stack picks it up immediately. Separating the fingers for 120 ms places it; a brief accidental separation followed by re-pinching continues the carry. The target and fence orientation stay fixed during that grace period. A missing hand cancels after 120 ms, and stale camera samples expire instead of sticking indefinitely. Illegal drops return the piece without spending the turn.

In camera mode a held fence follows the nearest horizontal or vertical board gap. A dead zone of 0.12 cell keeps the previous direction near intersections and equal-distance diagonals. Keep the palm facing the camera and the fingers pinched while aiming; hand roll does not turn the fence. The preview and HUD show the selected direction. Mouse and touch use right-click, R, or the on-screen button. A manual rotation locks the direction for that carry. While a button is held down, the browser often skips the right-button pointer event and only fires the context menu; that menu turns the fence too, and a plain right-click is not counted twice.

`REGION` in `src/input.ts` is the part of the camera image that maps onto the screen.

## Study scene

The landscape angled view combines the original photographed board and surroundings with Three.js pawn and placed fence meshes. The 3D camera is calibrated to the photographed board, and pawn heads and bases can both be picked up. Fence stock remains part of the image-based scene.

Top view and portrait layouts use the Three.js board with low walnut/green-lined slotted coffers. The selected diagonal arrangement groups the near cup/watch with the left coffer and the far tea service with the right coffer; a book/candelabra and plant balance the other corners. These views are not claimed to be pixel-identical to the original photograph. All views share rules, positions, 0.28/0.42 pinch thresholds, 120 ms release and gap-based fence orientation. View switching cancels a carry without spending a turn. The original title/results panels and input controls remain functional. Local scene assets are bundled by Vite; no runtime art service or new dependency is required. See `design-qa.md` for earlier fidelity and interaction evidence.

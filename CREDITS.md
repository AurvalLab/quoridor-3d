# Credits

| What | Licence | Source |
| --- | --- | --- |
| hand-gesture-kit (`src/hand-gesture-kit/`) | MIT | https://github.com/abouchedidxcode/open-source-hands |
| Quoridor MCTS AI (`src/vendor/quoridor-ai/`) | MIT, Copyright 2019 Kyutae Lee | https://github.com/gorisanson/quoridor-ai |
| MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) and the Hand Landmarker model (downloaded to `public/models/`) | Apache-2.0 | Google, https://github.com/google-ai-edge/mediapipe |
| three.js | MIT | https://threejs.org |
| 3D coin geometry & embossed bezel design (adapted: cylinder + torus rim + extruded relief) | MIT, Copyright 2017 James Greenleaf | https://github.com/aMoniker/coins-visualization |
| 3D coin face/edge material & flip ceremony (adapted: 3-material cylinder + RepeatWrapping milled edge) | MIT, Copyright 2019 rene78 | https://github.com/rene78/Rotating-Coin |
| Fraunces (font, via `@fontsource/fraunces`) | SIL Open Font License 1.1 | Undercase Type |
| Manrope (font, via `@fontsource/manrope`) | SIL Open Font License 1.1 | Mikhail Sharanda |
| Vite, Vitest, TypeScript, Playwright (development only) | MIT / Apache-2.0 | npm |

Quoridor is a board game designed by Mirko Marchesi and published by Gigamic. This is an independent implementation of the rules for play in a browser. It is not affiliated with Gigamic.

All sound is generated in the browser. The exact angled-scene artwork (`src/assets/reference-table.png`) was supplied by the user. Its empty-background plate (`reference-clean.png`) and the 3D walnut texture (`salon-walnut.webp`) were produced with the built-in ImageGen tool for this project. Source-pixel masks provide the photographed pawns and stock; they are not substitute vector illustrations. Prompts and asset provenance are recorded in `outputs/reference-match/asset-provenance.md`.

The alternate Three.js views use procedural board, tile, pawn, table, chair, rug, floorboard, tea-set, plant, book, pen, candelabra, coffer and pocket-watch geometry. Ceramic/metal reflections use three.js RoomEnvironment generated locally; no external HDR image is loaded. Static mesh batching uses three.js BufferGeometryUtils. Additional low-frequency wood maps are painted on canvas at runtime.

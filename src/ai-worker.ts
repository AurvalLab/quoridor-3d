import { search } from './vendor/quoridor-ai/adapter.js';
import type { Game } from './rules';

self.onmessage = (event: MessageEvent<{ game: Game; simulations: number }>) => {
  self.postMessage(search(event.data.game, event.data.simulations));
};

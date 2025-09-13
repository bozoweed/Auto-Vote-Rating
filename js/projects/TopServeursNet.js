import { TopGamesNet } from './TopGamesNet.js';

// top-serveurs.net (FR) – inherits logic from TopGamesNet
export class TopServeursNet extends TopGamesNet {
  static altdomain = 'top-serveurs.net';
  // Show “listing” (category) in manual mode hints (e.g., gta, minecraft, fivem…)
  static exampleURLListing() {
    return [
      'https://top-serveurs.net/',
      '<listing>',
      '/vote/<server-slug>/'
    ];
  }

  // We can rely on parent parseURL (now returns { lang, game, listing, id })
  // and parent voteURL/pageURL implementations.
}
import { BaseProject } from './BaseProject.js';

export class TopGamesNet extends BaseProject {
  static domain = 'top-games.net';

  static pageURL(project) {
    if (project.lang === 'fr') return `https://top-serveurs.net/${project.game}/${project.id}`;
    if (project.lang === 'en') return `https://top-games.net/${project.game}/${project.id}`;
    return `https://${project.lang}.top-games.net/${project.game}/${project.id}`;
  }

  static voteURL(project) {
    if (project.lang === 'fr') return `https://top-serveurs.net/${project.game}/vote/${project.id}`;
    if (project.lang === 'en') return `https://top-games.net/${project.game}/vote/${project.id}`;
    return `https://${project.lang}.top-games.net/${project.game}/vote/${project.id}`;
  }

  static projectName(doc) {
    // Be tolerant if the H1 isn’t present
    return (
      doc.querySelector('div.top-description h1')?.textContent ||
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      doc.title ||
      ''
    ).trim();
  }

  static exampleURL() {
    // prefix, id, suffix (used by manual mode hint)
    return ['https://top-serveurs.net/minecraft/', 'icesword-pvpfaction-depuis-2014-crack-on', ''];
  }

  static URLMain() { return 'top-games.net'; }

  static parseURL(url) {
    const paths = url.pathname.split('/');
    let lang;
    if (url.hostname === 'top-serveurs.net') lang = 'fr';
    else if (url.hostname === 'top-games.net') lang = 'en';
    else lang = url.hostname.split('.')[0]; // subdomain language

    const game = paths[1];
    const id = paths[2] === 'vote' ? paths[3] : paths[2];

    // IMPORTANT: also provide listing (alias of game)
    return { lang, game, listing: game, id };
  }

  static timeout() { return { hours: 2 }; }
  static limitedCountVote() { return true; }

  static exampleURLGame() { return ['https://top-serveurs.net/', 'minecraft', '/hailcraft']; }
  static defaultGame() { return 'minecraft'; }

  static gameList() {
    return new Map([
      ['ark','ARK'],['dayz','Dayz'],['discord','Discord'],['garrys-mod',"Garry's mod"],
      ['gta','GTA 5'],['hytale','Hytale'],['l4d2','Left 4 Dead 2'],['minecraft','Minecraft'],
      ['rdr','Red Dead Redemption 2'],['roblox','Roblox'],['rust','Rust'],['terraria','Terraria']
    ]);
  }

  static defaultLand() { return 'fr'; }
  static langList() {
    return new Map([
      ['de','Deutsch'],['en','English'],['es','Español'],
      ['fr','Français'],['pt','Português'],['ru','Русский']
    ]);
  }
}
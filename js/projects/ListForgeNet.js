import { BaseProject } from './BaseProject.js';

export class ListForgeNet extends BaseProject {
  static domain = 'listforge.net';
  static pageURL(project) { return `https://${project.game}/server/${project.id}/vote/`; }
  static voteURL(project) {
    const extra = project.addition != null ? project.addition : '';
    return `https://${project.game}/server/${project.id}/vote/${extra}`;
  }
  static projectName(doc) { return doc.querySelector('head > title').textContent.replace('Vote for ', ''); }
  static exampleURL() { return ['https://minecraft-mp.com/server/', '81821', '/vote/']; }
  static URLMain() { return 'listforge.net'; }
  static parseURL(url) {
    const paths = url.pathname.split('/');
    const project = { game: url.host };
    if (paths[1].startsWith('server-s')) project.id = paths[1].replace('server-s', '');
    else project.id = paths[2];
    project.addition = url.search && url.search.length > 0 ? url.search : '';
    return project;
  }
  static timeout() { return { hour: 5 }; }
  static notFound(doc) {
    for (const el of doc.querySelectorAll('div.alert.alert-info')) {
      if (el.textContent.includes('server has been removed')) return el.textContent.trim();
    }
    for (const el of doc.querySelectorAll('span.badge')) {
      if (el.textContent.includes('server has been removed')) return el.textContent.trim();
    }
  }
  static exampleURLGame() { return ['https://', 'minecraft-mp.com', '/server/207380/vote/']; }
  static gameList() {
    return new Map([
      ['7daystodie-servers.com','7 Days To Die'],['ark-servers.net','ARK : Survival Evolved'],
      ['arma3-servers.net','Arma3'],['atlas-servers.io','Atlas'],['conan-exiles.com','Conan Exiles'],
      ['counter-strike-servers.net','Counter Strike : Global Offensive'],['cubeworld-servers.com','Cube World'],
      ['dayz-servers.org','DayZ'],['ecoservers.io','ECO'],['empyrion-servers.com','Empyrion'],
      ['gmod-servers.com',"Garry's Mod"],['hurtworld-servers.net','Hurtworld'],['hytale-servers.io','Hytale'],
      ['life-is-feudal.org','Life is Feudal'],['minecraft-mp.com','Minecraft'],['minecraftpocket-servers.com','Minecraft Pocket'],
      ['minecraft-tracker.com','Minecraft Tracker'],['miscreated-servers.com','Miscreated'],['reign-of-kings.net','Reign of Kings'],
      ['rust-servers.net','Rust'],['space-engineers.com','Space Engineers'],['squad-servers.com','Squad'],
      ['starbound-servers.net','Starbound'],['tf2-servers.com','Team Fortress 2'],['teamspeak-servers.org','Teamspeak'],
      ['terraria-servers.com','Terraria'],['unturned-servers.net','Unturned'],['wurm-unlimited.com','Wurm Unlimited']
    ]);
  }
  static optionalNick() { return true; }
  static additionExampleURL() { return ['https://minecraft-mp.com/server/41366/vote/', '?alternate_captcha=1', '']; }
  static needAdditionalOrigins(project) {
    const noSteam = new Set([
      'cubeworld-servers.com','hytale-servers.io','minecraft-mp.com','minecraftpocket-servers.com','terraria-servers.com','valheim-servers.io'
    ]);
    return noSteam.has(project.game) ? [] : ['*://*.steamcommunity.com/*'];
  }
}
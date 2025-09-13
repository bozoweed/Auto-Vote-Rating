import { BaseProject } from './BaseProject.js';

export class TopGOrg extends BaseProject {
  static domain = 'topg.org';
  static pageURL(project) { return `https://topg.org/${project.game}/${project.id}`; }
  static voteURL(project) { return `https://topg.org/${project.game}/${project.id}`; }
  static projectName(doc) { return doc.querySelector('div.sheader').textContent; }
  static exampleURL() { return ['https://topg.org/minecraft-servers/', 'server-405637', '']; }
  static parseURL(url) { return { game: url.pathname.split('/')[1], id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 12 }; }
  static exampleURLGame() { return ['https://topg.org/', 'minecraft-servers', '/server-405637']; }
  static gameList() {
    return new Map([
      ['minecraft-servers','Minecraft'],
      ['cs-servers','Counter Strike: 1.6'],
      ['mu-private-servers','Mu Online'],
      ['wow-private-servers','World of Warcraft'],
      ['runescape-private-servers','Runescape']
    ]);
  }
}
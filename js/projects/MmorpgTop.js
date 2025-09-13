import { BaseProject } from './BaseProject.js';

export class MmorpgTop extends BaseProject {
  static domain = 'mmorpg.top';
  static pageURL(project) { return `https://${project.game}.mmorpg.top/server/${project.id}`; }
  static voteURL(project) { return `https://${project.game}.mmorpg.top/server/${project.id}`; }
  static projectName(doc) { return doc.querySelector('.title [itemprop="name"]').textContent; }
  static exampleURL() { return ['https://wow.mmorpg.top/server/', '23', '']; }
  static parseURL(url) { return { game: url.hostname.split('.')[0], id: url.pathname.split('/')[2] }; }
  static ordinalWorld() { return true; }
  static exampleURLGame() { return ['https://', 'wow', '.mmorpg.top/server/23']; }
  static gameList() {
    return new Map([
      ['l2','Lineage 2'],['wow','World of Warcraft'],['aion','Aion'],['mu','MU Online'],
      ['jd','Jade Dynasty'],['pw','Perfect World'],['rf','RF Online'],['so','Silkroad Online'],
      ['co','Conquer Online'],['og','Other games']
    ]);
  }
}
import { BaseProject } from './BaseProject.js';

export class MmoVoteRu extends BaseProject {
  static domain = 'mmovote.ru';
  static pageURL(project) { return `https://${project.game}.mmovote.ru/ru/vote/${project.id}`; }
  static voteURL(project) { return `https://${project.game}.mmovote.ru/ru/vote/${project.id}`; }
  static projectName(doc) {
    return doc.querySelector('.content .box h2').textContent.replace('Голосование за ', '');
  }
  static exampleURL() { return ['https://wow.mmovote.ru/ru/vote/', '85', '']; }
  static parseURL(url) { return { game: url.hostname.split('.')[0], id: url.pathname.split('/')[3] }; }
  static ordinalWorld() { return true; }
  static exampleURLGame() { return ['https://', 'wow', '.mmovote.ru/ru/vote/85']; }
  static gameList() {
    return new Map([
      ['wow','World of Warcraft'],['l2','Lineage 2'],['aion','Aion'],['mu','MU Online'],
      ['rf','RF Online'],['jade','Jade Dynasty'],['games','Online Games'],
      ['pw','Perfect World'],['minecraft','Minecraft']
    ]);
  }
}
import { BaseProject } from './BaseProject.js';

export class MmoTopRu extends BaseProject {
  static domain = 'mmotop.ru';
  static pageURL(project) {
    if (project.lang === 'ru') return `https://${project.game}.mmotop.ru/servers/${project.id}`;
    return `https://${project.game}.mmotop.ru/${project.lang}/servers/${project.id}`;
  }
  static voteURL(project) {
    if (project.lang === 'ru') return `https://${project.game}.mmotop.ru/servers/${project.id}/votes/new`;
    return `https://${project.game}.mmotop.ru/${project.lang}/servers/${project.id}/votes/new`;
  }
  static projectName(doc) { return doc.querySelector('.server-one h1').textContent; }
  static exampleURL() { return ['https://pw.mmotop.ru/servers/', '25895', '/votes/new']; }
  static parseURL(url) {
    const paths = url.pathname.split('/');
    const game = url.hostname.split('.')[0];
    if (paths[1] === 'servers') return { game, lang: 'ru', id: paths[2] };
    return { game, lang: paths[1], id: paths[3] };
  }
  static timeout() { return { hour: 20 }; }
  static oneProject() { return 1; }
  static ordinalWorld() { return true; }
  static exampleURLGame() { return ['https://', 'pw', '.mmotop.ru/servers/25895/votes/new']; }
  static gameList() {
    return new Map([
      ['aion','Aion'],['mu','Global FIU Online'],['jd','Jade Dynasty'],['la2','Lineage 2'],
      ['all','Online Games (All)'],['pw','Perfect World'],['rf','RF Online'],['wow','World War Craft']
    ]);
  }
  static defaultLand() { return 'ru'; }
  static langList() { return new Map([['en','English'],['ru','Русский']]); }
}
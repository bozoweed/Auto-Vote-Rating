import { BaseProject } from './BaseProject.js';

export class McMonitoringInfo extends BaseProject {
  static domain = 'mc-monitoring.info';
  static pageURL(project) {
    if (project.game === 'minecraft') return `https://mc-monitoring.info/server/${project.id}`;
    return `https://mc-monitoring.info/${project.game}/server/${project.id}`;
  }
  static voteURL(project) {
    if (project.game === 'minecraft') return `https://mc-monitoring.info/server/vote/${project.id}`;
    return `https://mc-monitoring.info/${project.game}/server/vote/${project.id}`;
  }
  static projectName(doc) {
    return doc.querySelector('.hello h1').textContent.replace('Игровой сервер ', '');
  }
  static exampleURL() { return ['https://mc-monitoring.info/wow/server/vote/', '112', '']; }
  static parseURL(url) {
    const paths = url.pathname.split('/');
    if (paths[1] === 'server') {
      const id = paths[2] === 'vote' ? paths[3] : paths[2];
      return { game: 'minecraft', id };
    }
    const id = paths[3] === 'vote' ? paths[4] : paths[3];
    return { game: paths[1], id };
  }
  static exampleURLGame() { return ['https://mc-monitoring.info/', 'wow', '/server/vote/112']; }
  static gameList() { return new Map([['wow','World of Warcraft'],['l2','Lineage 2'],['gta','GTA'],['minecraft','Minecraft']]); }
}
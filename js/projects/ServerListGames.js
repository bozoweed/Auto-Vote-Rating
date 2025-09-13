import { BaseProject } from './BaseProject.js';

export class ServerListGames extends BaseProject {
  static domain = 'serverlist.games';
  static pageURL(project) { return `https://serverlist.games/server/${project.id}`; }
  static voteURL(project) { return `https://serverlist.games/vote/${project.id}`; }
  static projectName(doc) { return doc.querySelector('div.card-title-server h5').textContent; }
  static exampleURL() { return ['https://serverlist.games/vote/', '2052', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 20 }; }
}
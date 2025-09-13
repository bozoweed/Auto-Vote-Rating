import { BaseProject } from './BaseProject.js';

export class MinecraftServerNet extends BaseProject {
  static domain = 'minecraft-server.net';
  static pageURL(project) { return `https://minecraft-server.net/details/${project.id}/`; }
  static voteURL(project) { return `https://minecraft-server.net/vote/${project.id}/`; }
  static projectName(doc) { return doc.querySelector('div.card-header > h2').textContent; }
  static exampleURL() { return ['https://minecraft-server.net/vote/', 'TitanicFreak', '/']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 24 }; }
}
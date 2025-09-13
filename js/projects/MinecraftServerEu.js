import { BaseProject } from './BaseProject.js';

export class MinecraftServerEu extends BaseProject {
  static domain = 'minecraft-server.eu';
  static pageURL(project) { return `https://minecraft-server.eu/server/index/${project.id}`; }
  static voteURL(project) { return `https://minecraft-server.eu/vote/index/${project.id}`; }
  static projectName(doc) { return doc.querySelector('div.serverName').textContent; }
  static exampleURL() { return ['https://minecraft-server.eu/vote/index/', '1A73C', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[3] }; }
  static timeout() { return { hour: 23 }; }
}
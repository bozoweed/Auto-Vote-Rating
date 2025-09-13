import { BaseProject } from './BaseProject.js';

export class BestMinecraftServersCo extends BaseProject {
  static domain = 'best-minecraft-servers.co';
  static pageURL(project) { return `https://best-minecraft-servers.co/${project.id}`; }
  static voteURL(project) { return `https://best-minecraft-servers.co/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('table.info th').textContent.trim(); }
  static exampleURL() { return ['https://best-minecraft-servers.co/', 'server-hypixel-network.30', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
}
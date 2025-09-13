import { BaseProject } from './BaseProject.js';

export class ServersMinecraftNet extends BaseProject {
  static domain = 'servers-minecraft.net';
  static pageURL(project) { return `https://servers-minecraft.net/${project.id}`; }
  static voteURL(project) { return `https://servers-minecraft.net/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('div.text-xl').textContent.trim(); }
  static exampleURL() { return ['https://servers-minecraft.net/', 'server-complex-gaming.58', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
  static timeout() { return { hour: 5 }; }
}
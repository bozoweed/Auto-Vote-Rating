import { BaseProject } from './BaseProject.js';

export class MinecraftServerSk extends BaseProject {
  static domain = 'minecraft-server.sk';
  static pageURL(project) { return `https://minecraft-server.sk/${project.id}/vote`; }
  static voteURL(project) { return `https://minecraft-server.sk/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('.server.icon').parentElement.innerText.trim(); }
  static exampleURL() { return ['https://minecraft-server.sk/', 'server-luoend.52', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 24 }; }
}
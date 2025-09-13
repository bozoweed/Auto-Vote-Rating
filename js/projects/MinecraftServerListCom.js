import { BaseProject } from './BaseProject.js';

export class MinecraftServerListCom extends BaseProject {
  static domain = 'minecraft-server-list.com';
  static pageURL(project) { return `https://minecraft-server-list.com/server/${project.id}/`; }
  static voteURL(project) { return `https://minecraft-server-list.com/server/${project.id}/vote/`; }
  static projectName(doc) { return doc.querySelector('.server-heading > a').textContent; }
  static exampleURL() { return ['https://minecraft-server-list.com/server/', '292028', '/vote/']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 23 }; }
}
import { BaseProject } from './BaseProject.js';

export class MinecraftServersDashBiz extends BaseProject {
  static domain = 'minecraft-servers.biz';
  static pageURL(project) { return `https://minecraft-servers.biz/server/${project.id}/`; }
  static voteURL(project) { return `https://minecraft-servers.biz/server/${project.id}/vote/`; }
  static projectName(doc) { return doc.querySelector('div[itemprop="name"]').innerText.trim(); }
  static exampleURL() { return ['https://minecraft-servers.biz/server/', 'roleplay-hub-schoolrp', '/vote/']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 22 }; }
  static alertManualCaptcha() { return true; }
  static optionalNick() { return true; }
}
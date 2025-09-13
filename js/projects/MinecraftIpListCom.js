import { BaseProject } from './BaseProject.js';

export class MinecraftIpListCom extends BaseProject {
  static domain = 'minecraftiplist.com';
  static pageURL(project) { return `https://www.minecraftiplist.com/server/${project.id}`; }
  static voteURL(project) { return `https://www.minecraftiplist.com/server/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('.server-info-title').innerText; }
  static exampleURL() { return ['https://www.minecraftiplist.com/server/', 'PurplePrison1SponsoredServer-5020', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 24 }; }
}
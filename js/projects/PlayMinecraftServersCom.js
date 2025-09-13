import { BaseProject } from './BaseProject.js';

export class PlayMinecraftServersCom extends BaseProject {
  static domain = 'play-minecraft-servers.com';
  static pageURL(project) { return `https://play-minecraft-servers.com/minecraft-servers/${project.id}/`; }
  static voteURL(project) { return `https://play-minecraft-servers.com/minecraft-servers/${project.id}/?tab=vote`; }
  static projectName(doc) { return doc.querySelector('.server-title h2').innerText; }
  static exampleURL() { return ['https://play-minecraft-servers.com/minecraft-servers/', 'opblocks', '/?tab=vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 0 }; }
  static notRequiredCaptcha() { return true; }
  static oneProject() { return 1; }
}
import { BaseProject } from './BaseProject.js';

export class InfinityBotsGg extends BaseProject {
  static domain = 'infinitybots.gg';
  static pageURL(project) { return `https://infinitybots.gg/bot/${project.id}`; }
  static voteURL(project) { return `https://infinitybots.gg/bot/${project.id}/vote`; }
  static projectName(doc) { 
    return doc.querySelector('title').innerText.trim().replaceAll(' | Infinity Bots', ''); 
  }
  static exampleURL() { return ['https://infinitybots.gg/bot/', '1047520294685909158', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 6 }; }
  static notRequiredNick() { return true; }
  static needAdditionalOrigins() { return ['https://discord.com/oauth2/*']; }
}
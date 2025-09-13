import { BaseProject } from './BaseProject.js';

export class BotListMe extends BaseProject {
  static domain = 'botlist.me';
  static pageURL(project) { return `https://botlist.me/bots/${project.id}`; }
  static voteURL(project) { return `https://botlist.me/bots/${project.id}/vote`; }
  static projectName(doc) { 
    return doc.querySelector('title').innerText.trim().replaceAll(' | Discord Bot', ''); 
  }
  static exampleURL() { return ['https://botlist.me/bots/', '1052586565395828778', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 12 }; }
  static notRequiredNick() { return true; }
  static notRequiredCaptcha() { return true; }
  static needAdditionalOrigins() { return ['https://discord.com/oauth2/*']; }
}
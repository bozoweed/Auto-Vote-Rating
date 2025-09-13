import { BaseProject } from './BaseProject.js';

export class DiscadiaCom extends BaseProject {
  static domain = 'discadia.com';
  static pageURL(project) { return `https://discadia.com/server/${project.id}/`; }
  static voteURL(project) { return `https://discadia.com/vote/${project.id}/`; }
  static projectName(doc) { return doc.querySelector('section.items-center > h1').textContent; }
  static exampleURL() { return ['https://discadia.com/server/', 'rq6-valorant-boost', '/']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 24 }; }
  static oneProject() { return 1; }
  static notRequiredNick() { return true; }
  static notRequiredCaptcha() { return true; }
  static needAdditionalOrigins() { return ['https://discord.com/oauth2/*']; }
}
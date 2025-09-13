import { BaseProject } from './BaseProject.js';

export class BestServersCom extends BaseProject {
  static domain = 'bestservers.com';
  static pageURL(project) { return `https://bestservers.com/server/${project.id}/vote`; }
  static voteURL(project) { return `https://bestservers.com/server/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('th.server').textContent.trim(); }
  static exampleURL() { return ['https://bestservers.com/server/', '1135', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static optionalNick() { return true; }
  static needAdditionalOrigins() { return ['*://*.steamcommunity.com/*']; }
}
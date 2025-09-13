import { BaseProject } from './BaseProject.js';

export class McListeDe extends BaseProject {
  static domain = 'mc-liste.de';
  static pageURL(project) { return `https://www.mc-liste.de/server/${project.id}`; }
  static voteURL(project) { return `https://www.mc-liste.de/server/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('.srvName').innerText; }
  static exampleURL() { return ['https://www.mc-liste.de/server/', '54', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static alertManualCaptcha() { return true; }
}
import { BaseProject } from './BaseProject.js';

export class McServersCom extends BaseProject {
  static domain = 'mc-servers.com';
  static pageURL(project) { return `https://mc-servers.com/server/${project.id}`; }
  static voteURL(project) { return `https://mc-servers.com/vote/${project.id}`; }
  static projectName(doc) { return doc.querySelector('.main-panel h1').textContent; }
  static exampleURL() { return ['https://mc-servers.com/server/', '1890', '/']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 4 }; }
}
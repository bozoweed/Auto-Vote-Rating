import { BaseProject } from './BaseProject.js';

export class McServerListCom extends BaseProject {
  static domain = 'mc-server-list.com';
  static pageURL(project) { return `https://mc-server-list.com/server/${project.id}/`; }
  static voteURL(project) { return `https://mc-server-list.com/server/${project.id}/vote/`; }
  static projectName(doc) { return doc.querySelector('h2.header').textContent; }
  static exampleURL() { return ['https://mc-server-list.com/server/', '127-Armageddon+Server', '/vote/']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
}
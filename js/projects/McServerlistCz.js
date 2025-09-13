import { BaseProject } from './BaseProject.js';

export class McServerlistCz extends BaseProject {
  static domain = 'mc-serverlist.cz';
  static pageURL(project) { return `https://mc-serverlist.cz/${project.id}`; }
  static voteURL(project) { return `https://mc-serverlist.cz/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('table.info th').textContent.trim(); }
  static exampleURL() { return ['https://mc-serverlist.cz/', 'server-lendmark.27', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
}
import { BaseProject } from './BaseProject.js';

export class McListsOrg extends BaseProject {
  static domain = 'mc-lists.org';
  static pageURL(project) { return `https://mc-lists.org/${project.id}/vote`; }
  static voteURL(project) { return `https://mc-lists.org/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('div.header > div.ui.container').textContent.trim(); }
  static exampleURL() { return ['https://mc-lists.org/', 'server-luxurycraft.1818', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
  static timeout() { return { hours: 12 }; }
}
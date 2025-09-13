import { BaseProject } from './BaseProject.js';

export class CzechCraftEu extends BaseProject {
  static domain = 'czech-craft.eu';
  static pageURL(project) { return `https://czech-craft.eu/server/${project.id}/`; }
  static voteURL(project) { return `https://czech-craft.eu/server/${project.id}/vote/`; }
  static projectName(doc) { return doc.querySelector('a.server-name').textContent; }
  static exampleURL() { return ['https://czech-craft.eu/server/', 'trenend', '/vote/']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 2 }; }
  static limitedCountVote() { return true; }
}
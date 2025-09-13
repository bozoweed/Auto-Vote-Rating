import { BaseProject } from './BaseProject.js';

export class CraftBookCz extends BaseProject {
  static domain = 'craftbook.cz';
  static pageURL(project) { return `https://craftbook.cz/server/${project.id}`; }
  static voteURL(project) { return `https://craftbook.cz/server/${project.id}`; }
  static projectName(doc) { return doc.querySelector('#desc h1').textContent; }
  static exampleURL() { return ['https://craftbook.cz/server/', 'mc.hesovodoupe.cz:25565', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 2 }; }
  static limitedCountVote() { return true; }
}
import { BaseProject } from './BaseProject.js';

export class MinecraftServeryEu extends BaseProject {
  static domain = 'minecraftservery.eu';
  static pageURL(project) { return `https://minecraftservery.eu/server/${project.id}`; }
  static voteURL(project) { return `https://minecraftservery.eu/server/${project.id}`; }
  static projectName(doc) { return doc.querySelector('div.container div.box h1.title').textContent; }
  static exampleURL() { return ['https://minecraftservery.eu/server/', '105', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 2 }; }
  static limitedCountVote() { return true; }
}
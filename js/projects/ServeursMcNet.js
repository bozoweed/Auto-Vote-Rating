import { BaseProject } from './BaseProject.js';

export class ServeursMcNet extends BaseProject {
  static domain = 'serveurs-mc.net';
  static pageURL(project) { return `https://serveurs-mc.net/serveur/${project.id}`; }
  static voteURL(project) { return `https://serveurs-mc.net/serveur/${project.id}/voter`; }
  static projectName(doc) { return doc.querySelector('h1.text-center').textContent; }
  static exampleURL() { return ['https://serveurs-mc.net/serveur/', '82', '/voter']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 2 }; }
  static limitedCountVote() { return true; }
}
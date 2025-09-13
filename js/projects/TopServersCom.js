import { BaseProject } from './BaseProject.js';

export class TopServersCom extends BaseProject {
  static domain = 'topservers.com';
  static pageURL(project) { return `https://topservers.com/${project.id}`; }
  static voteURL(project) { return `https://topservers.com/${project.id}#vote`; }
  static projectName(doc) { return doc.querySelector('h1[itemprop="name"]').textContent; }
  static exampleURL() { return ['https://topservers.com/', 'minecraft-server-hypixel.3368', '#vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
}
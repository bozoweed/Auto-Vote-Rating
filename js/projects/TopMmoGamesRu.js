import { BaseProject } from './BaseProject.js';

export class TopMmoGamesRu extends BaseProject {
  static domain = 'top-mmogames.ru';
  static pageURL(project) { return `https://top-mmogames.ru/${project.id}`; }
  static voteURL(project) { return `https://top-mmogames.ru/${project.id}`; }
  static projectName(doc) { return doc.querySelector('.gamefeatures [itemprop="name"]').textContent; }
  static exampleURL() { return ['https://top-mmogames.ru/', 'server-wow-amdfun', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
  static needPrompt() { return true; }
}
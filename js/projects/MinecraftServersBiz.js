import { BaseProject } from './BaseProject.js';

export class MinecraftServersBiz extends BaseProject {
  static domain = 'minecraftservers.biz';
  static pageURL(project) { return `https://minecraftservers.biz/${project.id}/`; }
  static voteURL(project) { return `https://minecraftservers.biz/${project.id}/`; }
  static projectName(doc) { return doc.querySelector('.panel-heading strong').textContent.trim(); }
  static exampleURL() { return ['https://minecraftservers.biz/', 'purpleprison', '/#vote_now']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
  static timeout() { return { hours: 12 }; }
}
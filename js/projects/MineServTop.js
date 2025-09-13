import { BaseProject } from './BaseProject.js';

export class MineServTop extends BaseProject {
  static domain = 'mineserv.top';
  static pageURL(project) { return `https://mineserv.top/${project.id}`; }
  static voteURL(project) { return `https://mineserv.top/${project.id}`; }
  static projectName(doc) { return doc.querySelector('.project-name h1').textContent; }
  static exampleURL() { return ['https://mineserv.top/', 'epserv', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
}
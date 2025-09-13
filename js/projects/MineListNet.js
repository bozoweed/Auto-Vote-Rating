import { BaseProject } from './BaseProject.js';

export class MineListNet extends BaseProject {
  static domain = 'minelist.net';
  static pageURL(project) { return `https://minelist.net/server/${project.id}`; }
  static voteURL(project) { return `https://minelist.net/vote/${project.id}`; }
  static projectName(doc) { return doc.querySelector('.panel-heading h1').innerText; }
  static exampleURL() { return ['https://minelist.net/server/', '2496', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 6 }; }
}
import { BaseProject } from './BaseProject.js';

export class TrackyServerCom extends BaseProject {
  static domain = 'trackyserver.com';
  static pageURL(project) { return `https://www.trackyserver.com/server/${project.id}`; }
  static voteURL(project) { return `https://www.trackyserver.com/server/${project.id}`; }
  static projectName(doc) { return doc.querySelector('div.panel h1').textContent.trim(); }
  static exampleURL() { return ['https://www.trackyserver.com/server/', 'anubismc-486999', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
}
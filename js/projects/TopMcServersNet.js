import { BaseProject } from './BaseProject.js';

export class TopMcServersNet extends BaseProject {
  static domain = 'top-mc-servers.net';
  static pageURL(project) { return `https://top-mc-servers.net/server/${project.id}`; }
  static voteURL(project) { return `https://top-mc-servers.net/server/${project.id}`; }
  static projectName(doc) { return doc.querySelector('.container h1.ibmpm').innerText.trim(); }
  static exampleURL() { return ['https://top-mc-servers.net/server/', '5', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 24 }; }
}
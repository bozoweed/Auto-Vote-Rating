import { BaseProject } from './BaseProject.js';

export class TopMcServersCom extends BaseProject {
  static domain = 'topmcservers.com';
  static pageURL(project) { return `https://topmcservers.com/server/${project.id}`; }
  static voteURL(project) { return `https://topmcservers.com/server/${project.id}`; }
  static projectName(doc) { return doc.querySelector('#server-metadata td').innerText; }
  static exampleURL() { return ['https://topmcservers.com/server/', '17', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 0 }; }
  static optionalNick() { return true; }
}
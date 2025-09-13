import { BaseProject } from './BaseProject.js';

export class ServerList101Com extends BaseProject {
  static domain = 'serverlist101.com';
  static pageURL(project) { return `https://serverlist101.com/server/${project.id}/`; }
  static voteURL(project) { return `https://serverlist101.com/server/${project.id}/vote/`; }
  static projectName(doc) { return doc.querySelector('.container li h1').textContent; }
  static exampleURL() { return ['https://serverlist101.com/server/', '1547', '/vote/']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 23 }; }
  static alertManualCaptcha() { return true; }
}
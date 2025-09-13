import { BaseProject } from './BaseProject.js';

export class FindMcServerCom extends BaseProject {
  static domain = 'findmcserver.com';
  static pageURL(project) { return `https://findmcserver.com/server/${project.id}`; }
  static voteURL(project) { return `https://findmcserver.com/server/${project.id}`; }
  static projectName() { return null; } // client-side app; fetch returns minimal shell
  static exampleURL() { return ['https://findmcserver.com/server/', 'sootmc', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 0 }; }
}
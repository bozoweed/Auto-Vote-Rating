import { BaseProject } from './BaseProject.js';

export class McServersTop extends BaseProject {
  static domain = 'mcservers.top';
  static pageURL(project) { return `https://mcservers.top/server/${project.id}`; }
  static voteURL(project) { return `https://mcservers.top/server/${project.id}`; }
  static projectName(doc) { return doc.querySelector('h1[itemprop="name"]').textContent; }
  static exampleURL() { return ['https://mcservers.top/server/', '1113', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static needPrompt() { return true; }
  static notRequiredCaptcha() { return true; }
}
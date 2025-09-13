import { BaseProject } from './BaseProject.js';

export class PixelmonServerListCom extends BaseProject {
  static domain = 'pixelmon-server-list.com';
  static pageURL(project) { return `https://pixelmon-server-list.com/server/${project.id}`; }
  static voteURL(project) { return `https://pixelmon-server-list.com/server/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('.page-header h1').textContent; }
  static exampleURL() { return ['https://pixelmon-server-list.com/server/', '181', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
}
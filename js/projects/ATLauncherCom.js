import { BaseProject } from './BaseProject.js';

export class ATLauncherCom extends BaseProject {
  static domain = 'atlauncher.com';
  static pageURL(project) { return `https://atlauncher.com/servers/server/${project.id}/vote`; }
  static voteURL(project) { return `https://atlauncher.com/servers/server/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('ol li:nth-child(3)').textContent.trim(); }
  static exampleURL() { return ['https://atlauncher.com/servers/server/', 'KineticNetworkSkyfactory4', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[3] }; }
  static timeout() { return { hours: 24 }; }
}
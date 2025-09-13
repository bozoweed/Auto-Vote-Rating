import { BaseProject } from './BaseProject.js';

export class McServerTimeCom extends BaseProject {
  static domain = 'mcservertime.com';
  static pageURL(project) { return `https://mcservertime.com/${project.id}`; }
  static voteURL(project) { return `https://mcservertime.com/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('.server.icon').parentElement.innerText.trim(); }
  static exampleURL() { return ['https://mcservertime.com/', 'server-blastmc-asia.1399', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
  static timeout() { return { hours: 12 }; }
}
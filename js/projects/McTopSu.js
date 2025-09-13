import { BaseProject } from './BaseProject.js';

export class McTopSu extends BaseProject {
  static domain = 'mctop.su';
  static pageURL(project) { return `https://mctop.su/servers/${project.id}/`; }
  static voteURL(project) { return `https://mctop.su/servers/${project.id}/vote/`; }
  static projectName(doc) { return doc.querySelector('.project-header > h1').textContent; }
  static exampleURL() { return ['https://mctop.su/servers/', '5231', '/']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 21 }; }
  static needAdditionalOrigins() { return ['*://*.vk.com/*']; }
  static needIsTrusted() { return true; }
}
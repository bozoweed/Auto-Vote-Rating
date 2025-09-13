import { BaseProject } from './BaseProject.js';

export class TopcraftRu extends BaseProject {
  static domain = 'topcraft.ru';
  static pageURL(project) { return `https://topcraft.club/servers/${project.id}/`; }
  static voteURL(project) { return `https://topcraft.club/servers/${project.id}/vote/`; }
  static projectName(doc) { return doc.querySelector('.project-header > h1').textContent; }
  static exampleURL() { return ['https://topcraft.club/servers/', '10496', '/']; }
  static URLMain() { return 'topcraft.ru'; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 21 }; }
  static needAdditionalOrigins() { return ['https://*.topcraft.ru/*', '*://*.vk.com/*']; }
  static needIsTrusted() { return true; }
}
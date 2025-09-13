import { BaseProject } from './BaseProject.js';

export class McRateSu extends BaseProject {
  static domain = 'mcrate.su';
  static pageURL(project) { return `http://mcrate.su/project/${project.id}`; }
  static voteURL(project) { return `http://mcrate.su/rate/${project.id}`; }
  static projectName(doc) { return doc.querySelector('#center-main > .top_panel > h1').textContent; }
  static exampleURL() { return ['http://mcrate.su/rate/', '4396', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 22 }; }
  static oneProject() { return 1; }
  static notFound(doc) {
    const el = doc.querySelector('div[class=error]');
    return el && el.textContent.includes('Проект с таким ID не найден');
  }
  static needAdditionalOrigins() { return ['*://*.vk.com/*']; }
}
import { BaseProject } from './BaseProject.js';

export class MonitoringMinecraftRu extends BaseProject {
  static domain = 'monitoringminecraft.ru';
  static pageURL(project) { return `https://monitoringminecraft.ru/top/${project.id}/`; }
  static voteURL(project) { return `https://monitoringminecraft.ru/top/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('#cap h1').textContent; }
  static exampleURL() { return ['https://monitoringminecraft.ru/top/', 'gg', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 21 }; }
  static notRequiredCaptcha() { return true; }
  static needAdditionalOrigins() { return ['*://*.vk.com/*']; }
  static needAdditionalPermissions() { return ['cookies']; }
}
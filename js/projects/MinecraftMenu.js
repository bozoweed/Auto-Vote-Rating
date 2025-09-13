import { BaseProject } from './BaseProject.js';

export class MinecraftMenu extends BaseProject {
  static domain = 'minecraft.menu';
  static pageURL(project) { return `https://minecraft.menu/${project.id}`; }
  static voteURL(project) { return `https://minecraft.menu/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('.server.icon').nextSibling.textContent; }
  static exampleURL() { return ['https://minecraft.menu/', 'server-insanitycraft-1-20.1279', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
  static timeout() { return { hours: 24 }; }
}
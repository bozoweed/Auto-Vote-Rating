import { BaseProject } from './BaseProject.js';

export class CraftListNet extends BaseProject {
  static domain = 'craft-list.net';
  static pageURL(project) { return `https://craft-list.net/minecraft-server/${project.id}`; }
  static voteURL(project) { return `https://craft-list.net/minecraft-server/${project.id}/vote`; }
  static projectName(doc) {
    return doc.querySelector('div.serverpage-navigation-headername.header').firstChild.textContent.trim();
  }
  static exampleURL() { return ['https://craft-list.net/minecraft-server/', 'Advancius-Network', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 24 }; }
}
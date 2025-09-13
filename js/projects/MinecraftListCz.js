import { BaseProject } from './BaseProject.js';

export class MinecraftListCz extends BaseProject {
  static domain = 'minecraft-list.cz';
  static pageURL(project) { return `https://www.minecraft-list.cz/server/${project.id}`; }
  static voteURL(project) { return `https://www.minecraft-list.cz/server/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('.card-body .text-center').textContent.trim(); }
  static exampleURL() { return ['https://www.minecraft-list.cz/server/', 'czech-survival', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 2 }; }
  static limitedCountVote() { return true; }
}
import { BaseProject } from './BaseProject.js';

export class ServeurMinecraftCom extends BaseProject {
  static domain = 'serveur-minecraft.com';
  static pageURL(project) { return `https://serveur-minecraft.com/${project.id}`; }
  static voteURL(project) { return `https://serveur-minecraft.com/${project.id}`; }
  static projectName(doc) { return doc.querySelector('div.title h1').textContent; }
  static exampleURL() { return ['https://serveur-minecraft.com/', '2908', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
  static timeout() { return { hours: 3 }; }
  static limitedCountVote() { return true; }
}
import { BaseProject } from './BaseProject.js';

export class ServeurMinecraftVoteFr extends BaseProject {
  static domain = 'serveur-minecraft-vote.fr';
  static pageURL(project) { return `https://serveur-minecraft-vote.fr/serveurs/${project.id}/vote`; }
  static voteURL(project) { return `https://serveur-minecraft-vote.fr/serveurs/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('.server-name').textContent; }
  static exampleURL() { return ['https://serveur-minecraft-vote.fr/serveurs/', 'ectalia.425', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 1, minutes: 30 }; }
  static limitedCountVote() { return true; }
}
import { BaseProject } from './BaseProject.js';

export class ListeServeursFr extends BaseProject {
  static domain = 'liste-serveurs.fr';
  static pageURL(project) { return `https://www.liste-serveurs.fr/${project.id}`; }
  static voteURL(project) { return `https://www.liste-serveurs.fr/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('.server.icon').parentElement.innerText.trim(); }
  static exampleURL() { return ['https://www.liste-serveurs.fr/', 'server-pixel-prime-serveur-pixelmon.512', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
  static timeout() { return { hours: 3 }; }
  static limitedCountVote() { return true; }
}
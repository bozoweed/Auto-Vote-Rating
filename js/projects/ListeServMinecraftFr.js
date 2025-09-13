import { BaseProject } from './BaseProject.js';

export class ListeServMinecraftFr extends BaseProject {
  static domain = 'liste-serv-minecraft.fr';
  static pageURL(project) { return `https://liste-serv-minecraft.fr/serveur?id=${project.id}`; }
  static voteURL(project) { return `https://liste-serv-minecraft.fr/serveur?id=${project.id}`; }
  static projectName(doc) { return doc.querySelector('#page h1').innerText; }
  static exampleURL() { return ['https://liste-serv-minecraft.fr/serveur?id=', '353', '']; }
  static parseURL(url) { return { id: url.searchParams.get('id') }; }
  // Intended 30 min timeout not supported; fallback 1 hour
  static timeout() { return { hour: 1 }; }
}
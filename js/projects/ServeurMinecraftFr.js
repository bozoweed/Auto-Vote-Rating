import { BaseProject } from './BaseProject.js';

export class ServeurMinecraftFr extends BaseProject {
  static domain = 'serveur-minecraft.fr';
  static pageURL(project) { return `https://serveur-minecraft.fr/${project.id}`; }
  static voteURL(project) { return `https://serveur-minecraft.fr/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('.server.icon').parentElement.innerText.trim(); }
  static exampleURL() { return ['https://serveur-minecraft.fr/', 'server-oneblock-farm2win.525', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
  static alertManualCaptcha() { return true; }
}
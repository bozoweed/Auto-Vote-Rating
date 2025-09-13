import { BaseProject } from './BaseProject.js';

export class ServidoresDeMinecraftEs extends BaseProject {
  static domain = 'servidoresdeminecraft.es';
  static pageURL(project) { return `https://servidoresdeminecraft.es/server/status/${project.id}`; }
  static voteURL(project) { return `https://servidoresdeminecraft.es/server/vote/${project.id}`; }
  static projectName(doc) { return doc.querySelector('.server-header h1').textContent; }
  static exampleURL() { return ['https://servidoresdeminecraft.es/server/vote/', 'gRQ7HvE8/play.minelatino.com', '']; }
  static parseURL(url) {
    const parts = url.pathname.split('/');
    return { id: parts[3] + '/' + parts[4] };
  }
}
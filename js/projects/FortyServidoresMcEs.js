import { BaseProject } from './BaseProject.js';

export class FortyServidoresMcEs extends BaseProject {
  static domain = '40servidoresmc.es';
  static pageURL(project) { return `https://www.40servidoresmc.es/${project.id}`; }
  static voteURL(project) { return `https://www.40servidoresmc.es/${project.id}-votar`; }
  static projectName(doc) { return doc.querySelector('div.caracteristicas div.tabla-head h2').innerText.trim(); }
  static exampleURL() { return ['https://www.40servidoresmc.es/', 'astraly', '-votar']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1].replaceAll('-votar', '') }; }
}
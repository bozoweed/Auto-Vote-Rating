import { BaseProject } from './BaseProject.js';

export class McServidoresCom extends BaseProject {
  static domain = 'mcservidores.com';
  static pageURL(project) { return `https://mcservidores.com/servidor/${project.id}`; }
  static voteURL(project) { return `https://mcservidores.com/servidor/${project.id}`; }
  static projectName(doc) { return doc.querySelector('#panel h1').textContent.trim(); }
  static exampleURL() { return ['https://mcservidores.com/servidor/', '122', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 24 }; }
  static oneProject() { return 1; }
}
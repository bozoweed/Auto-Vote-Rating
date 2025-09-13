import { BaseProject } from './BaseProject.js';

export class ServeursMinecraftOrg extends BaseProject {
  static domain = 'serveursminecraft.org';
  static pageURL(project) { return `https://www.serveursminecraft.org/serveur/${project.id}/`; }
  static voteURL(project) { return `https://www.serveursminecraft.org/serveur/${project.id}/`; }
  static projectName(doc) { return doc.querySelector('div.panel-heading b').textContent; }
  static exampleURL() { return ['https://www.serveursminecraft.org/serveur/', '1017', '/']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 24 }; }
}
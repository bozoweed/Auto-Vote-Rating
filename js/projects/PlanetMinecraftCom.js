import { BaseProject } from './BaseProject.js';

export class PlanetMinecraftCom extends BaseProject {
  static domain = 'planetminecraft.com';
  static pageURL(project) { return `https://www.planetminecraft.com/server/${project.id}/`; }
  static voteURL(project) { return `https://www.planetminecraft.com/server/${project.id}/vote/`; }
  static projectName(doc) { return doc.querySelector('#resource-title-text').textContent; }
  static exampleURL() { return ['https://www.planetminecraft.com/server/', 'legends-evolved', '/vote/']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 5 }; }
}
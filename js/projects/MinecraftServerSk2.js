import { BaseProject } from './BaseProject.js';

export class MinecraftServerSk2 extends BaseProject {
  static domain = 'minecraftserver.sk';
  static pageURL(project) { return `https://www.minecraftserver.sk/server/${project.id}/`; }
  static voteURL(project) { return `https://www.minecraftserver.sk/server/${project.id}/`; }
  static projectName(doc) { return doc.querySelector('.panel-body h3').innerText.trim(); }
  static exampleURL() { return ['https://www.minecraftserver.sk/server/', 'minicraft-cz-6', '/']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
}
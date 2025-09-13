import { BaseProject } from './BaseProject.js';

export class MinecraftSurvivalServersNet extends BaseProject {
  static domain = 'minecraftsurvivalservers.net';
  static pageURL(project) { return `https://minecraftsurvivalservers.net/server/${project.id}`; }
  static voteURL(project) { return `https://minecraftsurvivalservers.net/server/${project.id}/vote`; }
  static projectName(doc) { 
    return doc.querySelector('h1.large.header').textContent.replaceAll(' Minecraft Server', ''); 
  }
  static exampleURL() { return ['https://minecraftsurvivalservers.net/server/', '64', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
}
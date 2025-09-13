import { BaseProject } from './BaseProject.js';

export class CurseForgeCom extends BaseProject {
  static domain = 'curseforge.com';
  static pageURL(project) { return `https://www.curseforge.com/servers/minecraft/game/${project.id}/`; }
  static voteURL(project) { return `https://www.curseforge.com/servers/minecraft/game/${project.id}/vote`; }
  static projectName(doc) { 
    return doc.querySelector('title').textContent.replaceAll(' - The Best Minecraft Servers - CurseForge', ''); 
  }
  static exampleURL() { return ['https://www.curseforge.com/servers/minecraft/game/', 'lemoncloud', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[4] }; }
}
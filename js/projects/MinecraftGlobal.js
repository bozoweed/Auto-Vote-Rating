import { BaseProject } from './BaseProject.js';

export class MinecraftGlobal extends BaseProject {
  static domain = 'minecraft.global';
  static pageURL(project) { return `https://minecraft.global/server/${project.id}`; }
  static voteURL(project) { return `https://minecraft.global/server/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('h1').textContent; }
  static exampleURL() { return ['https://minecraft.global/server/', '8', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
}
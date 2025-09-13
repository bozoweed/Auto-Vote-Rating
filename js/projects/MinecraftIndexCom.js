import { BaseProject } from './BaseProject.js';

export class MinecraftIndexCom extends BaseProject {
  static domain = 'minecraft-index.com';
  static pageURL(project) { return `https://www.minecraft-index.com/${project.id}`; }
  static voteURL(project) { return `https://www.minecraft-index.com/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('h3.stitle').textContent; }
  static exampleURL() { return ['https://www.minecraft-index.com/', '33621-extremecraft-net', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
  static timeout() { return { hour: 0 }; }
  static alertManualCaptcha() { return true; }
}
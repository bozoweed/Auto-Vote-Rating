import { BaseProject } from './BaseProject.js';

export class McLikeCom extends BaseProject {
  static domain = 'mclike.com';
  static pageURL(project) { return `https://mclike.com/minecraft-server-${project.id}`; }
  static voteURL(project) { return `https://mclike.com/vote-${project.id}`; }
  static projectName(doc) { return doc.querySelector('div.text-server > h1').textContent.replace('Minecraft server ', ''); }
  static exampleURL() { return ['https://mclike.com/vote-', '188444', '']; }
  static parseURL(url) {
    let id = url.pathname.split('/')[1];
    id = id.replace('vote-', '').replace('minecraft-server-', '');
    return { id };
  }
  static oneProject() { return 1; }
}
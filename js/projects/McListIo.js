import { BaseProject } from './BaseProject.js';

export class McListIo extends BaseProject {
  static domain = 'mclist.io';
  static pageURL(project) { return `https://mclist.io/server/${project.id}`; }
  static voteURL(project) { return `https://mclist.io/server/${project.id}/vote`; }
  static projectName(doc) { 
    return doc.querySelector('title').textContent.replaceAll(' | mclist.io - Minecraft Server List', ''); 
  }
  static exampleURL() { return ['https://mclist.io/server/', '61609', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
}
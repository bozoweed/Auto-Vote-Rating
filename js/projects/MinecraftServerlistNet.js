import { BaseProject } from './BaseProject.js';

export class MinecraftServerlistNet extends BaseProject {
  static domain = 'minecraft-serverlist.net';
  static pageURL(project) { return `https://www.minecraft-serverlist.net/vote/${project.id}`; }
  static voteURL(project) { return `https://www.minecraft-serverlist.net/vote/${project.id}`; }
  static projectName(doc) { return doc.querySelector('a.server-name').textContent.trim(); }
  static exampleURL() { return ['https://www.minecraft-serverlist.net/vote/', '51076', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 23 }; }
}
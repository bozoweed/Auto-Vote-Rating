import { BaseProject } from './BaseProject.js';

export class MinecraftListOrg extends BaseProject {
  static domain = 'minecraftlist.org';
  static pageURL(project) { return `https://minecraftlist.org/server/${project.id}`; }
  static voteURL(project) { return `https://minecraftlist.org/vote/${project.id}`; }
  static projectName(doc) {
    return doc.querySelector('.container h1').textContent.trim().replace('Minecraft Server', '');
  }
  static exampleURL() { return ['https://minecraftlist.org/vote/', '11227', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 5 }; }
}
import { BaseProject } from './BaseProject.js';

export class MinecraftServers100Com extends BaseProject {
  static domain = 'minecraftservers100.com';
  static pageURL(project) { return `https://minecraftservers100.com/vote/${project.id}`; }
  static voteURL(project) { return `https://minecraftservers100.com/vote/${project.id}`; }
  static projectName(doc) {
    return doc.querySelector('div.page-header').textContent.trim().replace('Vote for ', '');
  }
  static exampleURL() { return ['https://minecraftservers100.com/vote/', '2340', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 24 }; }
}
import { BaseProject } from './BaseProject.js';

export class MineBrowseCom extends BaseProject {
  static domain = 'minebrowse.com';
  static pageURL(project) { return `https://minebrowse.com/server/${project.id}`; }
  static voteURL(project) { return `https://minebrowse.com/server/${project.id}`; }
  static projectName(doc) {
    return doc.querySelector('title').textContent.replace(' - Minebrowse Minecraft Server List', '');
  }
  static exampleURL() { return ['https://minebrowse.com/server/', '1638', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
}
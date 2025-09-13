import { BaseProject } from './BaseProject.js';

export class MinecraftBestServersCom extends BaseProject {
  static domain = 'minecraftbestservers.com';
  static pageURL(project) { return `https://minecraftbestservers.com/${project.id}`; }
  static voteURL(project) { return `https://minecraftbestservers.com/${project.id}/vote`; }
  static projectName(doc) {
    return doc.querySelector('header div.container h1.text-center')
      .textContent.replace(' Minecraft Server Info, Voting, and More', '');
  }
  static exampleURL() { return ['https://minecraftbestservers.com/', 'server-cherry-survival.4599', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
  static timeout() { return { hour: 0 }; }
}
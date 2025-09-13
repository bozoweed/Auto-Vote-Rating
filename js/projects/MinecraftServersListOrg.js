import { BaseProject } from './BaseProject.js';

export class MinecraftServersListOrg extends BaseProject {
  static domain = 'minecraft-servers-list.org';
  static pageURL(project) { return `https://www.minecraft-servers-list.org/details/${project.id}/`; }
  static voteURL(project) { return `https://www.minecraft-servers-list.org/index.php?a=in&u=${project.id}`; }
  static projectName(doc) { return doc.querySelector('div.card-header > h1').textContent.trim(); }
  static exampleURL() { return ['https://www.minecraft-servers-list.org/index.php?a=in&u=', 'chromity', '']; }
  static parseURL(url) {
    if (url.searchParams.has('u')) return { id: url.searchParams.get('u') };
    const paths = url.pathname.split('/');
    return { id: paths[2] };
  }
}
import { BaseProject } from './BaseProject.js';

export class MinecraftServersOrg extends BaseProject {
  static domain = 'minecraftservers.org';
  static pageURL(project) { return `https://minecraftservers.org/server/${project.id}`; }
  static voteURL(project) { return `https://minecraftservers.org/vote/${project.id}`; }
  static projectName(doc) { return doc.querySelector('div.header-bar div.text').innerText; }
  static exampleURL() { return ['https://minecraftservers.org/vote/', '25531', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 0 }; }
}
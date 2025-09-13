import { BaseProject } from './BaseProject.js';

export class TopMinecraftServersOrg extends BaseProject {
  static domain = 'topminecraftservers.org';
  static pageURL(project) { return `https://topminecraftservers.org/server/${project.id}`; }
  static voteURL(project) { return `https://topminecraftservers.org/vote/${project.id}`; }
  static projectName(doc) { return doc.querySelector('h1[property="name"]').textContent; }
  static exampleURL() { return ['https://topminecraftservers.org/vote/', '9126', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 5 }; }
}
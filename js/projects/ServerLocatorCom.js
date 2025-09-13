import { BaseProject } from './BaseProject.js';

export class ServerLocatorCom extends BaseProject {
  static domain = 'serverlocator.com';
  static pageURL(project) { return `https://serverlocator.com/server/${project.id}`; }
  static voteURL(project) { return `https://serverlocator.com/vote/${project.id}`; }
  static projectName(doc) { return doc.querySelector('.content_head h2').textContent; }
  static exampleURL() { return ['https://serverlocator.com/vote/', '440', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
}
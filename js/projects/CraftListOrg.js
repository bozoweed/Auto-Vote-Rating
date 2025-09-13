import { BaseProject } from './BaseProject.js';

export class CraftListOrg extends BaseProject {
  static domain = 'craftlist.org';
  static pageURL(project) { return `https://craftlist.org/${project.id}`; }
  static voteURL(project) { return `https://craftlist.org/${project.id}`; }
  static projectName(doc) { return doc.querySelector('main h1').innerText.trim(); }
  static exampleURL() { return ['https://craftlist.org/', 'basicland', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[1] }; }
  static timeout() { return { hours: 24 }; }
  static banAttention() { return true; }
}
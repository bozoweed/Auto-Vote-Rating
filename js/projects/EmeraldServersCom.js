import { BaseProject } from './BaseProject.js';

export class EmeraldServersCom extends BaseProject {
  static domain = 'emeraldservers.com';
  static pageURL(project) { return `https://emeraldservers.com/server/${project.id}`; }
  static voteURL(project) { return `https://emeraldservers.com/server/${project.id}`; }
  static projectName(doc) { return doc.querySelector('.infobar2 h1').innerText.trim(); }
  static exampleURL() { return ['https://emeraldservers.com/server/', '595', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
}
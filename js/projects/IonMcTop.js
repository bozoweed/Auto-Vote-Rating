import { BaseProject } from './BaseProject.js';

export class IonMcTop extends BaseProject {
  static domain = 'ionmc.top';
  static pageURL(project) { return `https://ionmc.top/projects/${project.id}/vote`; }
  static voteURL(project) { return `https://ionmc.top/projects/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('#app h1.header').innerText.replace('Голосование за проект ', ''); }
  static exampleURL() { return ['https://ionmc.top/projects/', '80', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 21 }; }
}
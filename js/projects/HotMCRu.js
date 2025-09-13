import { BaseProject } from './BaseProject.js';

export class HotMCRu extends BaseProject {
  static domain = 'hotmc.ru';
  static pageURL(project) { return `https://hotmc.ru/minecraft-server-${project.id}`; }
  static voteURL(project) { return `https://hotmc.ru/vote-${project.id}`; }
  static projectName(doc) { return doc.querySelector('div.text-server > h1').textContent.replace(' сервер Майнкрафт', ''); }
  static exampleURL() { return ['https://hotmc.ru/vote-', '199493', '']; }
  static parseURL(url) {
    const paths = url.pathname.split('/');
    let id = paths[1] || '';
    id = id.replace('vote-', '').replace('minecraft-server-', '');
    return { id };
  }
  static timeout() { return { hour: 21 }; }
  static oneProject() { return 1; }
}
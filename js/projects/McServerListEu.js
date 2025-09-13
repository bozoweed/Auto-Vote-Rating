import { BaseProject } from './BaseProject.js';

export class McServerListEu extends BaseProject {
  static domain = 'mcserver-list.eu';
  static pageURL(project) { return `https://mcserver-list.eu/server/${project.id}`; }
  static voteURL(project) { return `https://mcserver-list.eu/vote/${project.id}`; }
  static projectName(doc) { return doc.querySelector('.serverdetail h1').textContent; }
  static exampleURL() { return ['https://mcserver-list.eu/server/', '416', '']; }
  static parseURL(url) {
    const paths = url.pathname.split('/');
    if (paths[1].length === 2) return { id: url.pathname.split('/')[3] };
    return { id: url.pathname.split('/')[2] };
  }
  static timeout() { return { hours: 2 }; }
  static silentVote() { return true; }
  static limitedCountVote() { return true; }
  static notRequiredCaptcha() { return true; }
}
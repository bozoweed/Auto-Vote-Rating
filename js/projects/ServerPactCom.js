import { BaseProject } from './BaseProject.js';

export class ServerPactCom extends BaseProject {
  static domain = 'serverpact.com';
  static pageURL(project) { return `https://www.serverpact.com/vote-${project.id}`; }
  static voteURL(project) { return `https://www.serverpact.com/vote-${project.id}`; }
  static projectName(doc) { return doc.querySelector('h1.sp-title').textContent.trim().replace('Vote for ', ''); }
  static exampleURL() { return ['https://www.serverpact.com/vote-', '26492123', '']; }
  static URLMain() { return 'www.serverpact.com'; }
  static parseURL(url) { return { id: url.pathname.split('/')[1].replace('vote-', '') }; }
  static timeout() { return { hours: 11, minutes: 7 }; }
  static oneProject() { return 1; }
  static notFound(doc) {
    const el = doc.querySelector('div.container > div.row > div > center');
    return el && el.textContent.includes('This server does not exist');
  }
//   static silentVote() { return true; }
  static notRequiredCaptcha() { return true; }
}
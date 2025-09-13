import { BaseProject } from './BaseProject.js';

export class MineServersCom extends BaseProject {
  static domain = 'mineservers.com';
  static pageURL(project) { return `https://${project.game}/server/${project.id}/vote`; }
  static voteURL(project) { return `https://${project.game}/server/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('#title h1').textContent; }
  static exampleURL() { return ['https://mineservers.com/server/', 'jvvHdPJy', '/vote']; }
  static URLMain() { return 'mineservers.com'; }
  static parseURL(url) { return { game: url.hostname, id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 0 }; }
  static exampleURLGame() { return ['https://', 'mineservers.com', '/server/2zQ6UmWN/vote']; }
  static defaultGame() { return 'mineservers.com'; }
  static gameList() {
    return new Map([
      ['mineservers.com',''],
      ['pixelmonservers.com',''],
      ['tekkitserverlist.com',''],
      ['technicservers.com',''],
      ['ftbservers.com',''],
      ['attackofthebteamservers.com','']
    ]);
  }
  static alertManualCaptcha() { return true; }
}
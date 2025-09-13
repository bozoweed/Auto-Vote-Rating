import { BaseProject } from './BaseProject.js';

export class ServeurListeCom extends BaseProject {
  static domain = 'serveurliste.com';
  static pageURL(project) { return `https://www.serveurliste.com/${project.game}/${project.id}`; }
  static voteURL(project) { return `https://www.serveurliste.com/${project.game}/${project.id}#voter`; }
  static projectName(doc) { return doc.querySelector('div.container h1.text-center').innerText; }
  static exampleURL() { return ['https://www.serveurliste.com/minecraft/', 'nossaria-serveur-survie', '#voter']; }
  static parseURL(url) { return { game: url.pathname.split('/')[1], id: url.pathname.split('/')[2] }; }
  static exampleURLGame() { return ['https://www.serveurliste.com/', 'minecraft', '/nossaria-serveur-survie#voter']; }
  static defaultGame() { return 'minecraft'; }
  static gameList() {
    return new Map([
      ['minecraft','Minecraft'], ['rust','Rust'], ['fivem','fiveM'], ['flyff','Flyff'],
      ['discord','Discord'], ['garrys-mod', "Garry's Mod"]
    ]);
  }
  static timeout() { return { hours: 1, minutes: 30 }; }
  static limitedCountVote() { return true; }
  static oneProject() { return 1; }
}
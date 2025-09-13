import { BaseProject } from './BaseProject.js';

export class ServeurPriveNet extends BaseProject {
  static domain = 'serveur-prive.net';
  static pageURL(project) {
    return `https://serveur-prive.net/${project.lang === 'fr' ? '' : project.lang + '/'}${project.game}/${project.id}/vote`;
  }
  static voteURL(project) { return this.pageURL(project); }
  static projectName(doc) { return doc.querySelector('.description h2').textContent; }
  static exampleURL() { return ['https://serveur-prive.net/minecraft/', 'gommehd-net-4932', '/vote']; }
  static parseURL(url) {
    const project = {};
    const paths = url.pathname.split('/');
    if (paths[1].length === 2) { project.lang = paths[1]; project.game = paths[2]; project.id = paths[3]; }
    else { project.lang = 'fr'; project.game = paths[1]; project.id = paths[2]; }
    return project;
  }
  static timeout() { return { hours: 1, minutes: 30 }; }
  static limitedCountVote() { return true; }
  static alertManualCaptcha() { return true; }
  static exampleURLGame() { return ['https://serveur-prive.net/', 'minecraft', '/gommehd-net-4932']; }
  static defaultGame() { return 'minecraft'; }
  static gameList() {
    return new Map([
      ['ark','ARK'],['ark-survival-evolved','Ark : Survival Evolved'],['discord','Discord'],
      ['garrys-mod',"Garry's Mod"],['grand-theft-auto','Grand Theft Auto V'],['hytale','Hytale'],
      ['minecraft','Minecraft'],['minecraft-bedrock','Minecraft Bedrock'],['rust','Rust']
    ]);
  }
  static defaultLand() { return 'fr'; }
  static langList() { return new Map([['en','English'],['fr','Français']]); }
}
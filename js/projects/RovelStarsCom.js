import { BaseProject } from './BaseProject.js';

export class RovelStarsCom extends BaseProject {
  static domain = 'rovelstars.com';
  static pageURL(project) { return `https://${project.game}.rovelstars.com/${project.listing}/${project.id}`; }
  static voteURL(project) { return `https://${project.game}.rovelstars.com/${project.listing}/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('.hero-body h1.title').innerText.trim(); }
  static exampleURL() { return ['https://discord.rovelstars.com/bots/', '778697286950715413', '/vote']; }
  static parseURL(url) {
    const game = url.hostname.split('.')[0];
    const parts = url.pathname.split('/');
    return { game, listing: parts[1], id: parts[2] };
  }
  static timeout() { return { hours: 24 }; }
  static exampleURLListing() { return ['https://discord.rovelstars.com/', 'bots', '/778697286950715413/vote']; }
  static defaultListing() { return 'bots'; }
  static listingList() { return new Map([['bots','Bots']]); }
  static exampleURLGame() { return ['https://', 'discord', '.rovelstars.com/bots/778697286950715413/vote']; }
  static defaultGame() { return 'discord'; }
  static gameList() { return new Map([['discord','Discord']]); }
  static notRequiredNick() { return true; }
  static notRequiredCaptcha() { return true; }
  static needAdditionalOrigins() { return ['https://discord.com/oauth2/*']; }
}
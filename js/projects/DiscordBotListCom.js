import { BaseProject } from './BaseProject.js';

export class DiscordBotListCom extends BaseProject {
  static domain = 'discordbotlist.com';
  static pageURL(project) { return `https://discordbotlist.com/${project.listing}/${project.id}`; }
  static voteURL(project) { return `https://discordbotlist.com/${project.listing}/${project.id}/upvote`; }
  static projectName(doc) { return doc.querySelector('h1.bot-name').textContent.trim(); }
  static exampleURL() { return ['https://discordbotlist.com/bots/', 'dank-memer', '/upvote']; }
  static parseURL(url) { return { listing: url.pathname.split('/')[1], id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 12 }; }
  static exampleURLListing() { return ['https://discordbotlist.com/', 'bots', '/dank-memer/upvote']; }
  static defaultListing() { return 'bots'; }
  static listingList() { return new Map([['bots','Bots'],['servers','Guilds']]); }
  static notRequiredNick() { return true; }
  static needAdditionalOrigins() { return ['https://discord.com/oauth2/*']; }
}
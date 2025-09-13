import { BaseProject } from './BaseProject.js';

export class DiscordsCom extends BaseProject {
  static domain = 'discords.com';
  static pageURL(project) { return `https://discords.com/${project.listing}/${project.id}`; }
  static voteURL(project) {
    return `https://discords.com/${project.listing}/${project.id}${project.listing === 'servers' ? '/upvote' : '/vote'}`;
  }
  static projectName(doc, project) {
    if (project.game === 'servers') return doc.querySelector('.servernameh1').textContent;
    return null;
  }
  static exampleURL() { return ['https://discords.com/bots/bot/', '469610550159212554', '/vote']; }
  static parseURL(url) {
    const paths = url.pathname.split('/');
    if (paths[1] === 'servers') return { id: paths[2], listing: 'servers' };
    return { id: paths[3], listing: 'bots/bot' };
  }
  static timeout(project) { return project.listing === 'bots/bot' ? { hours: 12 } : { hours: 6 }; }
  static exampleURLListing() { return ['https://discords.com/', 'bots/bot', '/469610550159212554/vote']; }
  static defaultListing() { return 'bots'; }
  static listingList() { return new Map([['bots/bot','Bots'],['servers','Guilds']]); }
  static notRequiredNick() { return true; }
  static needAdditionalOrigins() { return ['https://discord.com/oauth2/*']; }
}
import { BaseProject } from './BaseProject.js';

export class TopGG extends BaseProject {
  static domain = 'top.gg';
  static pageURL(project) { return `https://top.gg/${project.listing}/${project.id}/vote`; }
  static voteURL(project) { return `https://top.gg/${project.listing}/${project.id}/vote${project.addition}`; }
  static projectName(doc) {
    for (const el of doc.querySelectorAll('h1')) {
      if (el.textContent.includes('Voting for ')) return el.textContent.replace('Voting for', '');
    }
  }
  static exampleURL() { return ['https://top.gg/bot/', '270904126974590976', '/vote']; }
  static parseURL(url) {
    const paths = url.pathname.split('/');
    return {
      listing: paths[1],
      id: paths[2],
      addition: url.search && url.search.length > 0 ? url.search : ''
    };
  }
  static timeout() { return { hours: 12 }; }
  static exampleURLListing() { return ['https://top.gg/', 'bot', '/270904126974590976/vote']; }
  static defaultListing() { return 'bot'; }
  static listingList() { return new Map([['bot','Bots'],['servers','Guilds']]); }
  static notRequiredNick() { return true; }
  static focusedTab() { return true; }
  static additionExampleURL() { return ['https://top.gg/bot/617037497574359050/vote', '?currency=DOGE', '']; }
  static needAdditionalOrigins() { return ['https://discord.com/oauth2/*']; }
}
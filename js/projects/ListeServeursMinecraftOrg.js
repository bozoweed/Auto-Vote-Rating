import { BaseProject } from './BaseProject.js';

export class ListeServeursMinecraftOrg extends BaseProject {
  static domain = 'liste-serveurs-minecraft.org';
  static pageURL(project) { return `https://www.liste-serveurs-minecraft.org/vote/?idc=${project.id}`; }
  static voteURL(project) { return `https://www.liste-serveurs-minecraft.org/vote/?idc=${project.id}`; }
  static projectName(doc) {
    const a = doc.querySelector('span.wlt_shortcode_TITLE-NOLINK');
    if (a) return a.textContent;
    const b = doc.querySelector('#gdrtsvote font[color="blue"]');
    return b ? b.textContent : '';
  }
  static exampleURL() { return ['https://www.liste-serveurs-minecraft.org/vote/?idc=', '202085', '']; }
  static parseURL(url) {
    if (url.searchParams.has('idc')) return { id: url.searchParams.get('idc') };
    return { id: url.pathname.split('/')[2] };
  }
  static timeout() { return { hours: 3 }; }
  static notFound(doc) {
    const el = doc.querySelector('#core_middle_column div.panel-body');
    return el && el.textContent.includes('serveur est introuvable');
  }
  static limitedCountVote() { return true; }
}
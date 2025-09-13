import { BaseProject } from './BaseProject.js';

export class MinecraftKrantNl extends BaseProject {
  static domain = 'minecraftkrant.nl';
  static pageURL(project) {
    const lang = project.lang || 'www.minecraftkrant.nl';
    const serverlist = lang === 'www.minecraftkrant.nl' ? 'serverlijst' : 'servers';
    return `https://${lang}/${serverlist}/${project.id}`;
  }
  static voteURL(project) {
    const lang = project.lang || 'www.minecraftkrant.nl';
    const serverlist = lang === 'www.minecraftkrant.nl' ? 'serverlijst' : 'servers';
    return `https://${lang}/${serverlist}/${project.id}/vote`;
  }
  static projectName(doc) { return doc.querySelector('div.s_HeadTitle h1').firstChild.textContent.trim(); }
  static exampleURL() { return ['https://www.minecraftkrant.nl/serverlijst/', 'torchcraft', '/vote']; }
  static URLMain() { return 'minecraftkrant.nl'; }
  static parseURL(url) { return { lang: url.host, id: url.pathname.split('/')[2] }; }
  static exampleURLLang() { return ['https://www.', 'minecraftkrant.nl', '/serverlijst/torchcraft/vote']; }
  static defaultLand() { return 'www.minecraftkrant.nl'; }
  static langList() { return new Map([['www.minecraftkrant.nl','Nederlands'],['minecraft-news.net','English']]); }
}
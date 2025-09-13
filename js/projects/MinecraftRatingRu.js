import { BaseProject } from './BaseProject.js';

export class MinecraftRatingRu extends BaseProject {
  static domain = 'minecraftrating.ru';
  static pageURL(project) {
    return project.listing === 'projects'
      ? `https://minecraftrating.ru/projects/${project.id}/`
      : `https://minecraftrating.ru/vote/${project.id}/`;
  }
  static voteURL(project) { return this.pageURL(project); }
  static projectName(doc, project) {
    if (project.listing === 'projects') {
      return doc.querySelector('h1[itemprop="name"]').textContent.trim().replace('Проект ', '');
    }
    return doc.querySelector('.page-header a').textContent;
  }
  static exampleURL() { return ['https://minecraftrating.ru/projects/', 'cubixworld', '/']; }
  static parseURL(url) {
    return {
      listing: url.pathname.split('/')[1] === 'projects' ? 'projects' : 'servers',
      id: url.pathname.split('/')[2]
    };
  }
  static timeout(project) { return project.listing === 'projects' ? { hour: 21 } : { hours: 24 }; }
  static exampleURLListing() { return ['https://minecraftrating.ru/', 'projects', '/mcskill/']; }
  static defaultListing() { return 'projects'; }
  static listingList() { return new Map([['projects','Проекты'],['servers','Сервера (нет награды за голосование)']]); }
  static notRequiredNick(project) { return project?.listing === 'servers'; }
  static needAdditionalOrigins(project) { return project?.listing === 'projects' ? ['*://*.vk.com/*'] : []; }
}
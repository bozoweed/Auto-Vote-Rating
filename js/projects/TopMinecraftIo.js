import { BaseProject } from './BaseProject.js';

export class TopMinecraftIo extends BaseProject {
  static domain = 'topminecraft.io';
  static pageURL(project) { return `https://topminecraft.io/${project.lang}/${project.id}`; }
  static voteURL(project) { return `https://topminecraft.io/${project.lang}/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('div.head h1').textContent; }
  static exampleURL() { return ['https://topminecraft.io/fr/', 'vikicraft-5', '/vote']; }
  static parseURL(url) { return { lang: url.pathname.split('/')[1], id: url.pathname.split('/')[2] }; }
  static defaultLand() { return 'fr'; }
  static langList() { return new Map([['en','English'],['fr','Français']]); }
}
import { BaseProject } from './BaseProject.js';

export class RPGParadizeCom extends BaseProject {
  static domain = 'rpg-paradize.com';
  static pageURL(project) { return `https://www.rpg-paradize.com/site--${project.id}`; }
  static voteURL(project) { return `https://www.rpg-paradize.com/?page=vote&vote=${project.id}`; }
  static projectName(doc) {
    return doc.querySelector('div.div-box > h1').textContent.replace('Vote : ', '');
  }
  static exampleURL() { return ['https://www.rpg-paradize.com/?page=vote&vote=', '113763', '']; }
  static parseURL(url) {
    if (url.searchParams.has('vote')) return { id: url.searchParams.get('vote') };
    const names = url.pathname.split('/')[1].split('-');
    return { id: names[names.length - 1] };
  }
}
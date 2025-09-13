import { BaseProject } from './BaseProject.js';

export class HoYoLABCom extends BaseProject {
  static domain = 'hoyolab.com';
  static pageURL(project) {
    if (!project.id || project.id === 'genshin impact daily') {
      return 'https://act.hoyolab.com/ys/event/signin-sea-v3/index.html?act_id=e202102251931481&lang=en-us';
    }
    return 'https://act.hoyolab.com/bbs/event/signin/hkrpg/index.html?act_id=e202303301540311&lang=en-us';
  }
  static voteURL(project) { return this.pageURL(project); }
  static projectName(_doc, project) {
    return (!project.id || project.id === 'genshin impact daily')
      ? 'Genshin Impact Daily check-in'
      : 'Honkai: Star Rail Daily check-in';
  }
  static exampleURL() { 
    return ['https://act.hoyolab.com/ys/event/signin-sea-v3/index.html?act_id=e202102251931481&lang=en-us', '', '']; 
  }
  static parseURL(url) {
    const act = url.searchParams.get('act_id');
    if (act === 'e202303301540311') return { id: 'honkai star rail daily' };
    if (act === 'e202102251931481') return { id: 'genshin impact daily' };
    return {};
  }
  static timeout() { return { hour: 16 }; }
  static notRequiredNick() { return true; }
}
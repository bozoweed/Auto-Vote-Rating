import { BaseProject } from './BaseProject.js';

export class GenshinDropCom extends BaseProject {
  static domain = 'genshindrop.com';
  static pageURL() { return 'https://genshindrop.com/case/24-chasa-oskolki'; }
  static voteURL() { return 'https://genshindrop.com/case/24-chasa-oskolki'; }
  static projectName() { return 'Бесплатный кейс 24 часа от Катерины'; }
  static exampleURL() { return ['https://genshindrop.com/', 'case/24-chasa-oskolki', '']; }
  static parseURL() { return { id: '24hcasekaterina' }; }
  static timeout() { return { hours: 24 }; }
  static silentVote() { return true; }
  static notRequiredCaptcha() { return true; }
  static notRequiredNick() { return true; }
  static notRequiredId() { return true; }
}
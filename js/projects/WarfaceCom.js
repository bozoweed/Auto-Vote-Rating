import { BaseProject } from './BaseProject.js';

export class WarfaceCom extends BaseProject {
  static domain = 'warface.com';
  static pageURL() { return 'https://ru.warface.com/bonus/'; }
  static voteURL() { return 'https://ru.warface.com/bonus/'; }
  static projectName() { return 'Bonus'; }
  static exampleURL() { return ['https://ru.warface.com/bonus/', '', '']; }
  static parseURL() { return { id: 'bonus' }; }
  static timeout() { return { week: 3, hour: 13 }; }
  static notRequiredCaptcha() { return true; }
  static notRequiredNick() { return true; }
  static notRequiredId() { return true; }
}
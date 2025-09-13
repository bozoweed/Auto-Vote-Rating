import { BaseProject } from './BaseProject.js';

export class LoliLandRu extends BaseProject {
  static domain = 'loliland.ru';
  static pageURL() { return 'https://loliland.net/bonus'; }
  static voteURL() { return 'https://loliland.net/bonus'; }
  static projectName() { return 'Бонус за подписку'; }
  static exampleURL() { return ['https://loliland.net/bonus', '', '']; }
  static URLMain() { return 'loliland.ru'; }
  static parseURL() { return { id: 'bonus subscribe' }; }
  static timeout() { return { hours: 24, minutes: 1 }; }
  static notRequiredCaptcha() { return true; }
  static notRequiredNick() { return true; }
  static notRequiredId() { return true; }
  static needAdditionalOrigins() { return ['https://*.loliland.ru/*', 'https://*.loliland.io/*']; }
  static needAdditionalPermissions() { return ['cookies']; }
}
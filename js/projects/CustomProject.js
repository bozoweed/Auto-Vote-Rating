import { BaseProject } from './BaseProject.js';

export class CustomProject extends BaseProject {
  static domain = 'Custom';
  static pageURL(project) { return project.responseURL; }
  static voteURL(project) { return project.responseURL; }
  static projectName() { return ''; }
  static exampleURL() { return ['', '', '']; }
  static parseURL() { return {}; }
  static silentVote() { return true; }
  static notRequiredCaptcha() { return true; }
}
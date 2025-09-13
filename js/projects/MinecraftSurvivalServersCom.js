import { BaseProject } from './BaseProject.js';

export class MinecraftSurvivalServersCom extends BaseProject {
  static domain = 'minecraftsurvivalservers.com';
  static pageURL(project) { return `https://minecraftsurvivalservers.com/server/${project.id}`; }
  static voteURL(project) { return `https://minecraftsurvivalservers.com/vote/${project.id}`; }
  static projectName() { return ''; } // site returns a preloaded shell via fetch
  static exampleURL() { return ['https://minecraftsurvivalservers.com/vote/', '248-rede-revo', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
}
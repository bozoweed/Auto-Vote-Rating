import { BaseProject } from './BaseProject.js';

export class Top100ArenaCom extends BaseProject {
  static domain = 'top100arena.com';
  static pageURL(project) { return `https://www.top100arena.com/listing/${project.id}/vote`; }
  static voteURL(project) { return `https://www.top100arena.com/listing/${project.id}/vote`; }
  static projectName(doc) { return doc.querySelector('.container.text-center h1.h2').textContent; }
  static exampleURL() { return ['https://www.top100arena.com/listing/', '94246', '/vote']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static notRequiredNick() { return true; }
}
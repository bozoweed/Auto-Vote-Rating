import { BaseProject } from './BaseProject.js';

export class TMonitoringCom extends BaseProject {
  static domain = 'tmonitoring.com';
  static pageURL(project) { return `https://tmonitoring.com/server/${project.id}/`; }
  static voteURL(project) { return `https://tmonitoring.com/server/${project.id}/`; }
  static projectName(doc) {
    return doc.querySelector('div[class="info clearfix"] > div.pull-left > h1').textContent;
  }
  static exampleURL() { return ['https://tmonitoring.com/server/', 'qoobworldru', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hours: 24 }; }
}
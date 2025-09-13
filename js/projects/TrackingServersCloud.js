import { BaseProject } from './BaseProject.js';

export class TrackingServersCloud extends BaseProject {
  static domain = 'trackingservers.cloud';
  static pageURL(project) { return `https://trackingservers.cloud/server/${project.id}`; }
  static voteURL(project) { return `https://trackingservers.cloud/server/vote/${project.id}`; }
  static projectName(doc) { return doc.querySelector('th.rank').innerText.trim(); }
  static exampleURL() { return ['https://trackingservers.cloud/server/vote/', 'dcgaming-network', '']; }
  static parseURL(url) {
    const parts = url.pathname.split('/');
    return parts[2] === 'vote' ? { id: parts[3] } : { id: parts[2] };
  }
}
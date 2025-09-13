import { BaseProject } from './BaseProject.js';

export class MinehutCom extends BaseProject {
  static domain = 'minehut.com';
  static pageURL(project) { return `https://minehut.com/sl/server/${project.id}`; }
  static voteURL(project) { return `https://minehut.com/sl/server/${project.id}`; }
  static projectName(doc) { return doc.querySelector('.ant-card-body h5').innerText; }
  static exampleURL() { return ['https://minehut.com/sl/server/', '3fNN/scufflemc', '']; }
  static parseURL(url) { 
    const parts = url.pathname.split('/');
    return { id: parts[3] + '/' + parts[4] };
  }
  static timeout() { return { hours: 6 }; }
}
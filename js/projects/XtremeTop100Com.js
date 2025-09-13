import { BaseProject } from './BaseProject.js';

export class XtremeTop100Com extends BaseProject {
  static domain = 'xtremetop100.com';
  static pageURL(project) { return `https://www.xtremetop100.com/in.php?site=${project.id}`; }
  static voteURL(project) { return `https://www.xtremetop100.com/in.php?site=${project.id}`; }
  static projectName(doc) {
    return doc.querySelector('#topbanner form[method="POST"] input[type="submit"]')
      .value.replace('Vote for ', '');
  }
  static exampleURL() { return ['https://www.xtremetop100.com/in.php?site=', '1132370645', '']; }
  static parseURL(url) {
    if (url.searchParams.has('site')) return { id: url.searchParams.get('site') };
    return { id: url.pathname.split('/')[1].replace('sitedetails-', '') };
  }
  static notRequiredNick() { return true; }
  static alertManualCaptcha() { return true; }
  static timeout() { return { hours: 12 }; }
}
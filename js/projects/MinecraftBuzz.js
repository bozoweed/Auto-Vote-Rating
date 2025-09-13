import { BaseProject } from './BaseProject.js';

export class MinecraftBuzz extends BaseProject {
  static domain = 'minecraft.buzz';
  static pageURL(project) { return `https://minecraft.buzz/server/${project.id}`; }
  static voteURL(project) { return `https://minecraft.buzz/vote/${project.id}`; }
  static projectName(doc) { return doc.querySelector('#vote-line').previousElementSibling.textContent.trim(); }
  static exampleURL() { return ['https://minecraft.buzz/vote/', '306', '']; }
  static parseURL(url) { return { id: url.pathname.split('/')[2] }; }
  static timeout() { return { hour: 0 }; }
}
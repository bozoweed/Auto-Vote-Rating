// background/modules/utils.js
export const wait = (ms) => new Promise(res => setTimeout(res, ms));

export function getProjectPrefix(project, detailed) {
  let text = '';
  if (project.nick) text += ' – ' + project.nick;
  if (detailed && project.game) text += ' – ' + project.game;
  if (detailed) {
    if (project.id) text += ' – ' + project.id;
    if (project.name) text += ' – ' + project.name;
  } else {
    if (project.name) text += ' – ' + project.name;
    else if (project.id) text += ' – ' + project.id;
  }
  if (text === '') return `[${project.rating}]`;
  return `[${project.rating}] ${text.replace(' – ', '')}`;
}
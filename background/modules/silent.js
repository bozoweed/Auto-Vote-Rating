// background/modules/silent.js
import { state, t } from './state.js';
import { sendNotification } from './notifications.js';
import { log } from './logs.js';
import { getProjectPrefix, wait } from './utils.js';
import { allProjects } from '../../js/projects.js';
import { getDomainWithoutSubdomain, extractHostname } from '../../js/utils/url.js';

const cache = Object.create(null); // rating -> { doc, url }

export async function runSilentVote(project) {
  if (!globalThis.DOMParser) {
    try { await import(chrome.runtime.getURL('libs/linkedom.mjs')); } catch {}
  }
  try {
    if (project.rating === 'Custom') {
      const res = await fetch(project.responseURL, { ...project.body });
      await res.text();
      if (res.ok) return { successfully: true };
      return { errorVote: [String(res.status), res.url] };
    }
    const key = (project.ratingMain || project.rating);
    const file = `scripts/${key}_silentvote.js`;
    if (!globalThis['silentVote_' + key]) {
      await import(chrome.runtime.getURL(file));
    }
    const r = await globalThis['silentVote_' + key](project); // expected to use fetch + checkResponseError
    return r || { successfully: true };
  } catch (e) {
    const msg = e?.message || '';
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError when attempting to fetch resource')) {
      return { notConnectInternet: true };
    }
    const request = { errorVoteNoElement: (e?.stack || msg || 'silent error') };
    if (cache[project.rating]) {
      request.html = cache[project.rating].doc.body.outerHTML;
      request.url = cache[project.rating].url;
    }
    return request;
  } finally {
    delete cache[project.rating];
  }
}

export async function checkResponseError(project, response, url, bypassCodes, vk) {
  let host = extractHostname(response.url);
  if (vk && host.includes('vk.com')) {
    if (response.headers.get('Content-Type')?.includes('windows-1251')) {
      response = await new Response(new TextDecoder('windows-1251').decode(await response.arrayBuffer()));
    }
  }
  response.html = await response.text();
  response.doc = new DOMParser().parseFromString(response.html, 'text/html');
  cache[project.rating] = { doc: response.doc, url: response.url };

  if (vk && host.includes('vk.com')) {
    let text = 'null';
    const d = response.doc;
    if (d.querySelector('div.oauth_form_access')) {
      text = d.querySelector('div.oauth_form_access').textContent.replace(d.querySelector('div.oauth_access_items').textContent, '').trim();
    } else if (d.querySelector('div.oauth_content > div')) {
      text = d.querySelector('div.oauth_content > div').textContent;
    } else if (d.querySelector('#login_blocked_wrap')) {
      text = d.querySelector('#login_blocked_wrap div.header').textContent + ' ' + d.querySelector('#login_blocked_wrap div.content').textContent.trim();
    } else if (d.querySelector('div.login_blocked_panel')) {
      text = d.querySelector('div.login_blocked_panel').textContent.trim();
    } else if (d.querySelector('.profile_deleted_text')) {
      text = d.querySelector('.profile_deleted_text').textContent.trim();
    } else if (response.html.length < 500) {
      text = response.html;
    }
    return { errorAuthVK: text };
  }

  if (!extractHostname(response.url).includes(url)) {
    return { message: t('errorRedirected', response.url) || ('Redirected to ' + response.url) };
  }

  if (bypassCodes?.length && bypassCodes.includes(response.status)) return true;

  if (!response.ok) return { errorVote: [String(response.status), response.url] };
  if (response.statusText && !['', 'ok', 'OK'].includes(response.statusText)) return { message: response.statusText };
  return true;
}
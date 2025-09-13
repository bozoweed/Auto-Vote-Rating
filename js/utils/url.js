// URL utilities

export const getDomainWithoutSubdomain = (url) => {
  const u = new URL(String(url).toLowerCase());
  const parts = u.hostname.split('.');
  return parts.slice(-(parts.length === 4 ? 3 : 2)).join('.');
};

export function extractHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    let hostname = url.includes('//') ? url.split('/')[2] : url.split('/')[0];
    hostname = hostname.split(':')[0];
    hostname = hostname.split('?')[0];
    return hostname;
  }
}
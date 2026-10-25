// Cassian website. Original project provenance: Crazaloth.
import {PUBLIC_BETA_API, validatePublicBeta, readBoundedJson, suggestionURL} from './release-policy.js';

const byId = id => document.getElementById(id);
const links = ['installer', 'portable', 'source', 'checksums', 'md5', 'readiness'];
let checksum = '';
let checking = false;

function clearDownloads() {
  checksum = '';
  for (const id of [...links.map(key => `${key}-link`), 'hero-installer-link']) {
    const link = byId(id);
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
  }
  byId('copy-sha').disabled = true;
  byId('installer-sha').textContent = 'Not yet available';
  byId('copy-status').textContent = '';
  byId('release-title').textContent = 'Cassian 8.0 Public Beta';
  byId('installer-size').textContent = 'Standalone + VST3 · Windows x64';
  byId('hero-release-note').textContent = 'Standalone + VST3 · Checking the official 8.0 installer…';
  for (const prefix of ['hero', 'download']) {
    byId(`${prefix}-checksum-badge`).hidden = true;
    byId(`${prefix}-checksum-short`).textContent = '';
  }
}

async function loadRelease() {
  if (checking) return;
  checking = true;
  clearDownloads();
  byId('refresh-release').disabled = true;
  byId('release-channel').textContent = 'CHECKING 8.0';
  byId('release-message').textContent = 'Checking the official 8.0 release and its files…';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(PUBLIC_BETA_API, {
      signal: controller.signal, credentials:'omit', redirect:'error', cache:'no-store',
      referrerPolicy:'no-referrer', headers: {Accept: 'application/vnd.github+json'}
    });
    if (response.status === 404) {
      byId('release-channel').textContent = 'AWAITING 8.0';
      byId('release-message').textContent = 'The 8.0 beta installer is not published yet. Check again after publication.';
      byId('hero-release-note').textContent = 'Standalone + VST3 · The 8.0 installer is awaiting publication.';
      return;
    }
    const release = validatePublicBeta(await readBoundedJson(response));
    for (const key of links) {
      const link = byId(`${key}-link`);
      link.href = release[key].url;
      link.rel = 'noopener noreferrer';
      link.removeAttribute('aria-disabled');
    }
    const heroLink = byId('hero-installer-link');
    heroLink.href = release.installer.url;
    heroLink.rel = 'noopener noreferrer';
    heroLink.removeAttribute('aria-disabled');
    byId('release-channel').textContent = 'PUBLIC BETA';
    byId('release-message').textContent = 'Download the installer and run Setup. The standalone app and VST3 are included.';
    byId('installer-size').textContent = `${(release.installer.size / 1000000).toFixed(1)} MB · Windows x64`;
    byId('hero-release-note').textContent = 'Standalone + VST3 · Free to play offline.';
    checksum = release.installer.sha256;
    byId('installer-sha').textContent = checksum;
    byId('copy-sha').disabled = false;
    for (const prefix of ['hero', 'download']) {
      byId(`${prefix}-checksum-short`).textContent = `${checksum.slice(0, 12)}…`;
      byId(`${prefix}-checksum-badge`).setAttribute('title', 'Published GitHub SHA-256; compare after downloading.');
      byId(`${prefix}-checksum-badge`).hidden = false;
    }
  } catch {
    clearDownloads();
    byId('release-channel').textContent = 'CHECK UNAVAILABLE';
    byId('release-message').textContent = 'We could not confirm the 8.0 installer. Check again or browse published releases.';
    byId('hero-release-note').textContent = 'The 8.0 download could not be verified. Try Check again below.';
  } finally {
    clearTimeout(timeout);
    byId('refresh-release').disabled = false;
    checking = false;
  }
}

byId('refresh-release').addEventListener('click', loadRelease);
loadRelease();
byId('copy-sha').addEventListener('click', async () => {
  if (!checksum) return;
  try {
    await navigator.clipboard.writeText(checksum);
    byId('copy-status').textContent = 'Copied.';
  } catch {
    byId('copy-status').textContent = 'Select and copy the hash above.';
  }
});
byId('suggestion-form').addEventListener('submit', event => {
  event.preventDefault();
  byId('suggestion-error').hidden = true;
  try {
    const url = suggestionURL(byId('suggestion-kind').value, byId('suggestion-title').value,
      byId('suggestion-body').value);
    byId('suggestion-link').href = url;
    byId('suggestion-result').hidden = false;
    byId('suggestion-link').focus();
  } catch {
    byId('suggestion-result').hidden = true;
    byId('suggestion-link').removeAttribute('href');
    byId('suggestion-error').hidden = false;
  }
});
for (const id of ['suggestion-kind', 'suggestion-title', 'suggestion-body']) {
  byId(id).addEventListener('input', () => {
    byId('suggestion-link').removeAttribute('href');
    byId('suggestion-result').hidden = true;
    byId('suggestion-error').hidden = true;
  });
}

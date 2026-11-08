/* YT Downloader — content script.
 *
 * Injects a small "Download" button below the YouTube player. Clicking it
 * opens the YT Downloader web app with the current video URL pre-filled, so
 * the app analyzes and downloads directly. No extension-to-backend traffic.
 */
(() => {
  'use strict';

  const DEFAULT_WEB_APP = 'http://localhost:5173';

  const ICON_DOWNLOAD =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>';

  const root = document.createElement('div');
  root.id = 'yt-dl-root';
  root.setAttribute('data-ytdl', '');
  root.innerHTML = `
    <button class="ytdl-btn" type="button" title="Download this video in the YT Downloader app">
      ${ICON_DOWNLOAD}<span class="ytdl-btn-label">Download</span>
    </button>
  `;
  const btn = root.querySelector('.ytdl-btn');

  function currentVideoId() {
    try {
      return new URL(location.href).searchParams.get('v');
    } catch {
      return null;
    }
  }

  function isWatchPage() {
    return /^https:\/\/[^/]*youtube\.com\/watch/.test(location.href) && !!currentVideoId();
  }

  btn.addEventListener('click', async () => {
    const videoId = currentVideoId();
    if (!videoId) return;
    const { webAppUrl } = await chrome.storage.sync.get('webAppUrl');
    const base = (webAppUrl || DEFAULT_WEB_APP).trim().replace(/\/+$/, '') || DEFAULT_WEB_APP;
    window.open(`${base}/?url=${encodeURIComponent(location.href)}`, '_blank');
  });

  function anchorElement() {
    return (
      document.querySelector('#player') ||
      document.querySelector('#above-the-fold') ||
      document.querySelector('#below')
    );
  }

  let lastAnchor = null;

  function ensureMounted() {
    if (!isWatchPage()) {
      root.remove();
      lastAnchor = null;
      return;
    }
    const anchor = anchorElement();
    if (!anchor) return; // page still building; observer will call again
    if (lastAnchor === anchor && root.isConnected) return;
    root.remove();
    anchor.insertAdjacentElement('afterend', root);
    lastAnchor = anchor;
    root.hidden = false;
  }

  // Re-mount when YouTube swaps the player/metadata around.
  const observer = new MutationObserver(() => ensureMounted());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureMounted();
})();
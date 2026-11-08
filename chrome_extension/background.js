/* YT Downloader — background service worker.
 *
 * Talks to the FastAPI backend (localhost or Render). Because the fetch
 * happens here with host permissions, the backend's CORS config does not
 * restrict the extension. Finished files are handed to chrome.downloads so
 * Chrome saves them to the normal Downloads folder.
 */

const DEFAULT_BACKEND = 'http://127.0.0.1:8000';

// download_id -> { timer, tabId }
const tasks = new Map();

function normalize(url) {
  let u = (url || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  return u.replace(/\/+$/, '');
}

async function currentBackend() {
  const { backendUrl } = await chrome.storage.sync.get('backendUrl');
  return normalize(backendUrl) || DEFAULT_BACKEND;
}

function hasHostPermission(url) {
  return chrome.permissions.contains({ origins: [url + '/*'] });
}

function extractError(data, status) {
  if (data && data.detail) {
    const d = data.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d.length && d[0] && d[0].msg) return d[0].msg;
  }
  return `Backend error (HTTP ${status})`;
}

async function apiFetch(method, path, body, timeoutMs = 45000) {
  const base = await currentBackend();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(
        `The backend at ${base} did not respond within ${Math.round(timeoutMs / 1000)}s. ` +
          `Check the URL in the panel's gear menu and make sure the backend is running.`
      );
    }
    throw new Error(
      `Cannot reach the backend at ${base}. Set the correct URL in the panel's gear menu.`
    );
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(extractError(data, res.status));
  return data;
}

function broadcast(tabId, message) {
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

function stopPolling(downloadId) {
  const task = tasks.get(downloadId);
  if (task && task.timer) clearInterval(task.timer);
  tasks.delete(downloadId);
}

function startPolling(downloadId, tabId) {
  stopPolling(downloadId);
  const timer = setInterval(async () => {
    let data;
    try {
      data = await apiFetch('GET', `/api/download-progress/${encodeURIComponent(downloadId)}`);
    } catch (err) {
      stopPolling(downloadId);
      broadcast(tabId, { type: 'ytdl-progress', downloadId, status: 'error', error: err.message });
      return;
    }

    broadcast(tabId, { type: 'ytdl-progress', downloadId, ...data });

    if (data.status === 'error') {
      stopPolling(downloadId);
      return;
    }
    if (data.status !== 'finished') return;

    stopPolling(downloadId);
    try {
      const base = await currentBackend();
      await chrome.downloads.download({
        url: `${base}/api/download-file/${encodeURIComponent(downloadId)}`,
        filename: data.filename || 'download',
        saveAs: false,
      });
    } catch (err) {
      broadcast(tabId, {
        type: 'ytdl-progress',
        downloadId,
        status: 'error',
        error: `Failed to save the file: ${err.message}`,
      });
      return;
    }
    broadcast(tabId, { type: 'ytdl-finished', downloadId, filename: data.filename || 'download' });
  }, 700);
  tasks.set(downloadId, { timer, tabId });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      console.info('[ytdl] message:', msg && msg.type, 'from', sender && sender.tab && sender.tab.url);
      const base = await currentBackend();
      console.info('[ytdl] using backend:', base);
      switch (msg && msg.type) {
        case 'get-config': {
          const { backendUrl } = await chrome.storage.sync.get('backendUrl');
          sendResponse({
            ok: true,
            backendUrl: backendUrl || DEFAULT_BACKEND,
            defaultBackendUrl: DEFAULT_BACKEND,
          });
          return;
        }
        case 'set-config': {
          const url = normalize(msg.backendUrl);
          if (!url) {
            sendResponse({ ok: false, error: 'Enter a backend URL (e.g. http://127.0.0.1:8000).' });
            return;
          }
          await chrome.storage.sync.set({ backendUrl: url });
          if (!(await hasHostPermission(url))) {
            const granted = await chrome.permissions
              .request({ origins: [url + '/*'] })
              .catch(() => false);
            if (!granted) {
              sendResponse({ ok: false, error: 'Host access to that backend was not granted.' });
              return;
            }
          }
          sendResponse({ ok: true, backendUrl: url });
          return;
        }
        case 'analyze': {
          const data = await apiFetch('POST', '/api/analyze', { url: msg.url });
          sendResponse({ ok: true, info: data });
          return;
        }
        case 'download': {
          const data = await apiFetch('POST', '/api/download', {
            url: msg.url,
            type: msg.mediaType,
            quality: msg.quality,
            output_format: msg.outputFormat,
          });
          if (!(await hasHostPermission(await currentBackend()))) {
            sendResponse({ ok: false, error: 'Host access to the backend is required to download.' });
            return;
          }
          startPolling(data.download_id, sender.tab && sender.tab.id);
          sendResponse({ ok: true, download_id: data.download_id });
          return;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type.' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  })();
  return true; // keep the message channel open for the async response
});
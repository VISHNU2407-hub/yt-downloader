/* YT Downloader — popup.
 *
 * Shows the web app URL used when the Download button is clicked, and lets
 * you change it (e.g. to a deployed app). The value is stored in
 * chrome.storage.sync.
 */

const DEFAULT_WEB_APP = 'http://localhost:5173';

const input = document.getElementById('webapp');
const status = document.getElementById('status');

function load() {
  chrome.storage.sync.get('webAppUrl').then(({ webAppUrl }) => {
    input.value = webAppUrl || DEFAULT_WEB_APP;
  });
}

document.getElementById('save').addEventListener('click', () => {
  const url = (input.value || '').trim().replace(/\/+$/, '');
  if (!url) {
    status.textContent = 'Enter a URL (e.g. http://localhost:5173).';
    status.style.color = '#f87171';
    return;
  }
  chrome.storage.sync.set({ webAppUrl: url }).then(() => {
    status.textContent = 'Saved \u2713';
    status.style.color = '#4ade80';
  });
});

load();
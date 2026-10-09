// Toolbar popup: the on/off switch and how many posts are hidden on this tab.
(async () => {
  'use strict';
  const enabled = document.getElementById('enabled');
  const siteControl = document.getElementById('site-control');
  const siteEnabled = document.getElementById('site-enabled');
  const siteLabel = document.getElementById('site-label');

  const { enabled: on, sites = { reddit: true, x: true, linkedin: true }, theme = 'system' } =
    await chrome.storage.local.get({ enabled: true, sites: { reddit: true, x: true, linkedin: true }, theme: 'system' });

  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else if (theme === 'light') document.documentElement.dataset.theme = 'light';

  enabled.checked = on;
  enabled.addEventListener('change', () => chrome.storage.local.set({ enabled: enabled.checked }));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  try {
    const s = await chrome.tabs.sendMessage(tab.id, { type: 'status' });
    const names = { reddit: 'Reddit', x: 'X / Twitter', linkedin: 'LinkedIn' };
    const siteName = names[s.site] || s.site;
    document.getElementById('count').textContent = s.hidden;
    document.getElementById('where').textContent = `hidden on this ${siteName} page`;
    if (s.error) { const e = document.getElementById('err'); e.textContent = s.error; e.hidden = false; }

    if (s.site && siteControl && siteEnabled && siteLabel) {
      siteLabel.textContent = `On ${siteName}`;
      siteEnabled.checked = sites[s.site] !== false;
      siteControl.hidden = false;
      siteEnabled.addEventListener('change', async () => {
        const cur = (await chrome.storage.local.get({ sites: {} })).sites || {};
        cur[s.site] = siteEnabled.checked;
        await chrome.storage.local.set({ sites: cur });
      });
    }
  } catch (_) {
    // Not a supported site (no content script answered).
  }
})();

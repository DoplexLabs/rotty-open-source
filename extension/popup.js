// Toolbar popup: the on/off switch and how many posts are hidden on this tab.
(async () => {
  'use strict';
  const enabled = document.getElementById('enabled');
  const { enabled: on } = await chrome.storage.local.get({ enabled: true });
  enabled.checked = on;
  enabled.addEventListener('change', () => chrome.storage.local.set({ enabled: enabled.checked }));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const s = await chrome.tabs.sendMessage(tab.id, { type: 'status' });
    const names = { reddit: 'Reddit', x: 'X', linkedin: 'LinkedIn' };
    document.getElementById('count').textContent = s.hidden;
    document.getElementById('where').textContent = `hidden on this ${names[s.site] || ''} page`;
    if (s.error) { const e = document.getElementById('err'); e.textContent = s.error; e.hidden = false; }
  } catch (_) {
    // Not a supported site (no content script answered).
  }
})();

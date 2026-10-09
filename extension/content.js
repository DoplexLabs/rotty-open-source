/*
 * Content script: finds posts as you scroll, sends their text to the service worker in small
 * batches, and folds away the ones judged to be slop. Each fold says why and has a Show button.
 * Only post text is read; never usernames.
 */
(() => {
  'use strict';
  const site = RottySites.forHost(location.hostname);
  if (!site) return;

  const MIN_CHARS = 20;       // very short items are skipped (often specific, rarely worth a request)
  const BATCH = 8;            // posts per request
  const DEBOUNCE_MS = 400;    // wait for the page to settle before asking
  const MAX_RETRIES = 3;      // retries for temporary API/Ollama failures

  let seen = new WeakSet();
  const queue = [];           // { id, el, item, retries }
  let timer = 0, nextId = 0, hiddenCount = 0, enabled = true, siteEnabled = true, lastError = '';
  let isFlushing = false;

  function updateBadge() {
    try {
      chrome.runtime.sendMessage({ type: 'badge', count: hiddenCount });
    } catch (_) {}
  }

  function isActive() {
    return enabled && siteEnabled;
  }

  function readText(el, target) {
    const parts = [...el.querySelectorAll(target.text)]
      .filter((t) => t.closest(target.item) === el)   // skip text from nested replies
      .map((t) => t.innerText.trim())
      .filter(Boolean);
    return parts.join('\n').replace(/\s+\n/g, '\n').trim();
  }

  function scan() {
    if (!isActive()) return;
    for (const target of site.targets) {
      for (const el of document.querySelectorAll(target.item)) {
        if (seen.has(el)) continue;
        const text = readText(el, target);
        if (!text) continue;                     // not rendered yet; try again on the next change
        seen.add(el);
        if (text.length < MIN_CHARS) continue;
        queue.push({ el, item: { id: `r${nextId++}`, site: site.name, kind: target.kind, text }, retries: 0 });
      }
    }
    if (queue.length && !isFlushing) flush();
  }

  async function flush() {
    if (isFlushing) return;
    isFlushing = true;

    try {
      while (queue.length && isActive()) {
        const batch = queue.splice(0, BATCH);
        let res;
        try {
          res = await chrome.runtime.sendMessage({ type: 'classify', items: batch.map((b) => b.item) });
        } catch (_) {
          return; // extension reloaded or updated; this page will be re-scanned on the next load
        }

        if (!res || res.error) {
          lastError = (res && res.error) || 'No answer from the model.';
          const currentRetries = (batch[0]?.retries || 0) + 1;
          if (currentRetries <= MAX_RETRIES) {
            for (const b of batch) b.retries = currentRetries;
            queue.unshift(...batch);
            await new Promise((resolve) => setTimeout(resolve, 1000 * currentRetries));
            continue;
          } else {
            // Exceeded retries: remove from seen so posts are not permanently dropped
            for (const b of batch) seen.delete(b.el);
            continue;
          }
        }

        lastError = '';
        let newlyFolded = 0;
        for (const b of batch) {
          const v = res.verdicts && res.verdicts[b.item.id];
          if (v && v.hide) {
            fold(b.el, v.label || 'slop');
            newlyFolded++;
          }
        }
        if (newlyFolded > 0) updateBadge();
      }
    } finally {
      isFlushing = false;
      if (queue.length && isActive()) schedule();
    }
  }

  function fold(el, label) {
    if (el.classList.contains('rotty-hidden') || el.previousElementSibling?.classList.contains('rotty-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'rotty-bar';
    bar.setAttribute('role', 'note');
    const why = document.createElement('span');
    why.textContent = `🐾 Hidden by Rotty: ${label}`;
    const show = document.createElement('button');
    show.type = 'button';
    show.textContent = 'Show';
    show.addEventListener('click', () => {
      const hidden = el.classList.toggle('rotty-hidden');
      show.textContent = hidden ? 'Show' : 'Hide';
    });
    bar.append(why, show);
    el.before(bar);
    el.classList.add('rotty-hidden');
    hiddenCount++;
  }

  function unfoldAll() {
    for (const bar of document.querySelectorAll('.rotty-bar')) bar.remove();
    for (const el of document.querySelectorAll('.rotty-hidden')) el.classList.remove('rotty-hidden');
    hiddenCount = 0;
    updateBadge();
  }

  function resetAndRescan() {
    unfoldAll();
    seen = new WeakSet();
    queue.length = 0;
    schedule();
  }

  const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, DEBOUNCE_MS); };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.local.get({
    enabled: true,
    sites: { reddit: true, x: true, linkedin: true },
  }).then((s) => {
    enabled = s.enabled !== false;
    siteEnabled = !s.sites || s.sites[site.name] !== false;
    schedule();
  });

  chrome.storage.onChanged.addListener((c) => {
    let stateChanged = false;
    if (c.enabled) {
      const prev = enabled;
      enabled = c.enabled.newValue !== false;
      if (prev !== enabled) stateChanged = true;
    }
    if (c.sites) {
      const sitesMap = c.sites.newValue || {};
      const prevSite = siteEnabled;
      siteEnabled = sitesMap[site.name] !== false;
      if (prevSite !== siteEnabled) stateChanged = true;
    }
    if (c.categories || c.strictness || c.customInstructions || c.provider || c.model) {
      stateChanged = true;
    }

    if (stateChanged) {
      if (!isActive()) {
        unfoldAll();
        seen = new WeakSet();
        queue.length = 0;
      } else {
        // Toggled back on or settings changed: re-scan posts on the current page
        resetAndRescan();
      }
    }
  });

  // The toolbar popup asks how many posts are hidden on this page.
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (sender.id === chrome.runtime.id && msg && msg.type === 'status') {
      reply({ site: site.name, hidden: hiddenCount, error: lastError, active: isActive() });
    }
  });
})();

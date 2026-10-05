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

  const seen = new WeakSet();
  const queue = [];           // { id, el, item }
  let timer = 0, nextId = 0, hiddenCount = 0, enabled = true, lastError = '';

  function readText(el, target) {
    const parts = [...el.querySelectorAll(target.text)]
      .filter((t) => t.closest(target.item) === el)   // skip text from nested replies
      .map((t) => t.innerText.trim())
      .filter(Boolean);
    return parts.join('\n').replace(/\s+\n/g, '\n').trim();
  }

  function scan() {
    if (!enabled) return;
    for (const target of site.targets) {
      for (const el of document.querySelectorAll(target.item)) {
        if (seen.has(el)) continue;
        const text = readText(el, target);
        if (!text) continue;                     // not rendered yet; try again on the next change
        seen.add(el);
        if (text.length < MIN_CHARS) continue;
        queue.push({ el, item: { id: `r${nextId++}`, site: site.name, kind: target.kind, text } });
      }
    }
    if (queue.length) flush();
  }

  async function flush() {
    while (queue.length) {
      const batch = queue.splice(0, BATCH);
      let res;
      try {
        res = await chrome.runtime.sendMessage({ type: 'classify', items: batch.map((b) => b.item) });
      } catch (_) {
        return; // extension reloaded or updated; this page will be re-scanned on the next load
      }
      if (!res || res.error) { lastError = (res && res.error) || 'No answer from the model.'; continue; }
      lastError = '';
      for (const b of batch) {
        const v = res.verdicts[b.item.id];
        if (v && v.hide) fold(b.el, v.label || 'slop');
      }
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
  }

  const schedule = () => { clearTimeout(timer); timer = setTimeout(scan, DEBOUNCE_MS); };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.local.get({ enabled: true }).then((s) => { enabled = s.enabled; schedule(); });
  chrome.storage.onChanged.addListener((c) => {
    if (c.enabled) {
      enabled = c.enabled.newValue;
      if (!enabled) unfoldAll();
      else schedule();
    }
  });

  // The toolbar popup asks how many posts are hidden on this page.
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (sender.id === chrome.runtime.id && msg && msg.type === 'status') reply({ site: site.name, hidden: hiddenCount, error: lastError });
  });
})();

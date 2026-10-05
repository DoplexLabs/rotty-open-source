/*
 * Site adapters: where posts and replies live on each site, and how to read their text.
 * Sites change their markup often. If Rotty stops finding posts somewhere, this is the file to fix,
 * and a great first contribution.
 *
 *   item:  the element to fold away when it's slop
 *   text:  the element inside it that holds what the person wrote
 *   kind:  'post' or 'reply' (the model is told which)
 */
(function (root) {
  'use strict';
  const SITES = {
    reddit: {
      host: /(^|\.)reddit\.com$/,
      targets: [
        { item: 'shreddit-comment', text: '[slot="comment"]', kind: 'reply' },
        { item: 'shreddit-post', text: '[slot="title"], [slot="text-body"]', kind: 'post' },
        { item: '.thing.comment > .entry', text: '.usertext-body .md', kind: 'reply' }, // old.reddit.com
      ],
    },
    x: {
      host: /(^|\.)x\.com$/,
      targets: [
        { item: 'article[data-testid="tweet"]', text: '[data-testid="tweetText"]', kind: 'post' },
      ],
    },
    linkedin: {
      host: /(^|\.)linkedin\.com$/,
      targets: [
        { item: 'article.comments-comment-entity', text: '.comments-comment-item__main-content', kind: 'reply' },
        { item: 'div.feed-shared-update-v2', text: '.update-components-text', kind: 'post' },
      ],
    },
  };

  function forHost(hostname) {
    for (const [name, site] of Object.entries(SITES)) if (site.host.test(hostname)) return { name, ...site };
    return null;
  }

  root.RottySites = { SITES, forHost };
})(globalThis);

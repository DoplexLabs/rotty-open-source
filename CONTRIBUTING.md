# Contributing to Rotty Lite

Thanks for helping. Rotty Lite is small on purpose: plain JavaScript, no build step, no dependencies. Please keep it that way.

## Good first contributions

- **A site stopped working.** Sites change their markup often. Update the selectors in [`extension/sites.js`](extension/sites.js) and say which page you tested on.
- **A new site.** Add an entry to `sites.js` and its address to `matches` in [`extension/manifest.json`](extension/manifest.json).
- **A better prompt.** Change [`extension/prompt.js`](extension/prompt.js). Include a few example posts it now gets right that it used to get wrong.
- **A new provider.** Add it to [`extension/providers.js`](extension/providers.js), its host to `host_permissions`, and a test to `tests/providers.test.js`.

## Workflow

1. Fork the repo and create a branch.
2. Load `extension/` unpacked in `chrome://extensions` (Developer mode) and try your change on the real site.
3. Run `npm test` (Node 20+).
4. Open a pull request that says what changed and how you tested it. Screenshots help for anything visible.

## Ground rules

- Read only the text of posts. Never read or send usernames, profile data, cookies or anything outside the post.
- API keys stay in the service worker and go only to their own provider.
- No remote code, analytics or tracking.
- Be kind. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

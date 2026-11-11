const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Static check: every local file the app needs offline must be pre-cached by the
// service worker. Without this, a SW version bump wipes the old cache and any
// file missing from APP_SHELL is unavailable offline until visited online again.

const DOCS = path.join(__dirname, '..', 'docs');

// Recipe data is cached by recipes.js in localStorage, not by the SW.
const NOT_SW_CACHED = new Set(['recipes.json', 'recipes-manifest.json']);

function appShell() {
  const src = fs.readFileSync(path.join(DOCS, 'sw.js'), 'utf8');
  const body = src.match(/const APP_SHELL = \[([\s\S]*?)\];/)[1];
  return new Set([...body.matchAll(/'([^']+)'/g)].map(m => m[1]));
}

function requiredFiles() {
  const required = new Set();
  const htmlFiles = fs.readdirSync(DOCS).filter(f => f.endsWith('.html'));

  for (const file of htmlFiles) {
    required.add(file);
    const html = fs.readFileSync(path.join(DOCS, file), 'utf8');
    for (const [, ref] of html.matchAll(/(?:src|href)="([^"#?:]+\.(?:js|css|svg|png|mp3|mp4|webmanifest))"/g)) {
      required.add(ref);
    }
  }

  const jsDir = path.join(DOCS, 'js');
  for (const file of fs.readdirSync(jsDir)) {
    const js = fs.readFileSync(path.join(jsDir, file), 'utf8');
    for (const [, ref] of js.matchAll(/fetch\('([^']+)'/g)) required.add(ref);
    for (const [, ref] of js.matchAll(/'(assets\/[^'$]+\.(?:svg|png|mp3|mp4))'/g)) required.add(ref);
    for (const [, ref] of js.matchAll(/"(assets\/[^"$]+\.(?:svg|png|mp3|mp4))"/g)) required.add(ref);
  }

  for (const f of NOT_SW_CACHED) required.delete(f);
  return required;
}

test('service worker pre-caches every file pages and scripts reference', () => {
  const shell = appShell();
  const missing = [...requiredFiles()].filter(f => !shell.has(f)).sort();
  expect(missing).toEqual([]);

  // Every APP_SHELL entry must exist, or install silently skips it
  const nonexistent = [...shell]
    .filter(f => f !== './' && !fs.existsSync(path.join(DOCS, f)))
    .sort();
  expect(nonexistent).toEqual([]);
});

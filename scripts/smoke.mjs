// Cutover smoke test: every URL the 2020 site handed out must still resolve
// (invariant 8), plus the new routes and the data/search assets. Usage:
//   node scripts/smoke.mjs https://v2--theographic.netlify.app
// Exits non-zero on any failure. Follows redirects and reports the final
// status and, for redirects, where they landed.

const base = (process.argv[2] ?? 'https://theographic.netlify.app').replace(/\/$/, '');

/** [path, expected final status, optional regex the final URL must match] */
const cases = [
  // 2020 routes
  ['/', 200],
  ['/about/', 200],
  ['/browse/', 200],
  ['/passages/', 200, /\/browse\/#bible$/],
  ['/people/', 200, /\/browse\/#people$/],
  ['/places/', 200, /\/browse\/#places$/],
  ['/periods/', 200, /\/browse\/#periods$/],
  ['/john', 200, /\/john\/$/],
  ['/gen', 200],
  ['/1cor', 200],
  ['/person/moses_2108', 200],
  ['/person/paul_2479', 200],
  ['/person/adoni-bezek_96', 200],
  ['/place/jerusalem_636', 200],
  ['/place/antioch_68', 200],
  ['/place/abel-mizraim_9', 200],
  ['/?q=John%203:16', 200],
  ['/?q=Prov%2025:2', 200],
  // new routes
  ['/john/3/', 200],
  ['/ps/119/', 200],
  ['/phlm/', 200],
  ['/event/tower_of_babel_53/', 200],
  ['/period/first_missionary_journey_338/', 200],
  ['/offline/', 200],
  ['/manifest.webmanifest', 200],
  ['/sw.js', 200],
  ['/data/books.json', 200],
  ['/data/entities.index.json', 200],
  ['/data/verses.idx', 200],
  ['/data/verses.txt', 200],
  ['/data/graph.bin', 200],
  ['/sitemap-index.xml', 200],
  ['/no-such-page/', 404],
];

let failed = 0;
for (const [path, want, landing] of cases) {
  const url = base + path;
  let status,
    finalUrl,
    note = '';
  try {
    // Fragments never travel over HTTP, so fetch's `res.url` loses `#bible`;
    // read the first Location header when a landing pattern is expected.
    if (landing) {
      const first = await fetch(url, { redirect: 'manual' });
      const loc = first.headers.get('location') ?? '';
      finalUrl = loc.startsWith('/') ? base + loc : loc;
      status = finalUrl ? (await fetch(finalUrl.split('#')[0])).status : first.status;
    } else {
      const res = await fetch(url, { redirect: 'follow' });
      status = res.status;
      finalUrl = res.url;
      if (path.startsWith('/?q=')) {
        const html = await res.text();
        if (!/data-search|SearchPage|search-page|id="search"/i.test(html))
          note = ' (no search island in HTML)';
      }
    }
  } catch (e) {
    status = 'ERR';
    finalUrl = String(e);
  }
  const redirected = finalUrl && finalUrl !== url ? ` → ${finalUrl.replace(base, '')}` : '';
  const ok = status === want && (!landing || landing.test(finalUrl)) && !note;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${String(status).padStart(3)} ${path}${redirected}${note}`);
}
console.log(failed ? `\n${failed} failure(s)` : '\nall clear');
process.exit(failed ? 1 : 0);

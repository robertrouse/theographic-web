## Theographic

Theographic is a [knowledge graph](https://www.youtube.com/watch?v=mmQl6VGvX-c) of the Bible, weaving data about people, places, and periods of time into the tapestry of God's story. This data enables smarter search algorithms, new apps, and exciting research potential. It's an open-source project to share information about the scriptures in our digital world. **Learn more at [this link](https://www.notion.so/theographic/About-Theographic-bb40cb93b1ac43bd98252abce225d530)**.

This repository builds the website that lets people explore the data.

**v2.** The original Gatsby site depended on a Neo4j API that no longer exists.
This is the rebuild: a fully static site whose search engine runs in the
browser (in a Web Worker, from prebuilt indexes), built from the JSON in
[theographic-bible-metadata](https://github.com/robertrouse/theographic-bible-metadata)
at a pinned commit. It installs as a PWA, works offline after first use, and
wraps into iOS/Android shells with Capacitor. Progress, decisions and the
pick-up point for contributors: [`docs/CHECKPOINTS.md`](docs/CHECKPOINTS.md).

Search in one box: references (`John 3:16`, `Gen 1-3`, `Ps 23:1,4`, `I Sam 17`),
people and places with aliases and typo tolerance (`Saul`, `Jerusalm`), free
text over the KJV (`"search the scriptures"`, `shew`), mixed queries
(`Paul Antioch`, `love in John`), and filters (`in:nt`, `person:Simon`). Add
`&debug=1` to see why each result ranked where it did.

## Layout

- `packages/core` — the search engine and data model (pure TypeScript; also a CLI: `npx theographic search "Paul Antioch"`)
- `packages/data` — build pipeline from the metadata JSON to static bundles and indexes; the generated-definitions pipeline
- `apps/web` — the Astro site (prerendered pages, React islands for search, service worker)
- `apps/mobile` — Capacitor shells for iOS and Android
- `docs/` — roadmap, checkpoints, search design, decisions

## Development

Requires Node 22.

```sh
npm ci
npm run data      # build data bundles and search indexes from the pinned metadata commit
npm run dev       # http://localhost:8001
npm test
npm run build     # static output in apps/web/dist
npm run data:definitions -- submit --dry-run 30   # generated definitions (CP-08; needs an API key)
```

## Contributing

This project is backed by individuals passionate about applying our best technology to the mission of making disciples. Find out how to contribute your creative or technical skills at [this link](https://www.notion.so/theographic/Contributing-ab417439cabb4b22a241e19184660eb7).

## License

Code: GNU General Public License v3.0. Data: see the metadata repository.

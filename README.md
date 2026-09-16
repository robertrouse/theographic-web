## Theographic

Theographic is a [knowledge graph](https://www.youtube.com/watch?v=mmQl6VGvX-c) of the Bible, weaving data about people, places, and periods of time into the tapestry of God's story. This data enables smarter search algorithms, new apps, and exciting research potential. It's an open-source project to share information about the scriptures in our digital world. **Learn more at [this link](https://www.notion.so/theographic/About-Theographic-bb40cb93b1ac43bd98252abce225d530)**.

This repository builds the website that lets people explore the data.

> **v2 in progress.** The original Gatsby site depended on a Neo4j API that no
> longer exists. It is being rebuilt as a fully static site with the search
> engine running in the browser, from the JSON in
> [theographic-bible-metadata](https://github.com/robertrouse/theographic-bible-metadata).
> Progress and the pick-up point for contributors: [`docs/CHECKPOINTS.md`](docs/CHECKPOINTS.md).

## Layout

- `packages/core` — the search engine and data model (pure TypeScript)
- `packages/data` — build pipeline from the metadata JSON to static bundles
- `apps/web` — the Astro site
- `docs/` — roadmap, checkpoints, search design, decisions

## Development

Requires Node 22.

```sh
npm ci
npm run data      # build data bundles (from CP-01 on)
npm run dev       # http://localhost:8001
npm test
npm run build     # static output in apps/web/dist
```

## Contributing

This project is backed by individuals passionate about applying our best technology to the mission of making disciples. Find out how to contribute your creative or technical skills at [this link](https://www.notion.so/theographic/Contributing-ab417439cabb4b22a241e19184660eb7).

## License

Code: GNU General Public License v3.0. Data: see the metadata repository.

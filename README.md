# Political TikTok Trends — Chaotic Era

An interactive web page charting how the biggest **political TikTok accounts**
have changed month over month since **October 2024**. Three longitudinal line charts
show, per account:

- **Total posts** published each month
- **Total views** received each month
- **Total engagements** (likes, comments, shares, saves) received each month

Every account is drawn as its own line, **colored by partisan lean**
(Left-Leaning, Neutral, Right-Leaning). Hover a line — or a row in the account
directory — to trace a single account across all three charts, and click any
account name to open its TikTok profile.

The page shares the fonts, colours, and layout of the Chaotic Era
[Substack](https://github.com/readchaoticera/SubstackPoliticsLeaderboard) and
[YouTube](https://github.com/readchaoticera/YouTubePoliticsLeaderboard)
leaderboards.

## Develop

```bash
npm run build   # rebuild data/timeseries.json from data/raw/*.csv
npm run serve   # static preview at http://localhost:8000
```

There is no build step for the page itself — `index.html`, `styles.css`,
`chart.js`, and `app.js` are served as-is. D3 is loaded from a CDN.

## Data

Monthly snapshots live in `data/raw/` as one CSV per month
(`OCTOBER_2024.csv` … `MAY_2026.csv`). Each row is one account for that month
with columns including `entity`, `political_lean`, `posts`, `total_views`,
`total_engagements`, and a `platforms` cell holding the account's TikTok URL.

`scripts/build-data.mjs` pivots these snapshots into a single
`data/timeseries.json` — one record per account carrying a value-per-month for
each metric, the account's lean, and its TikTok URL. Re-run `npm run build`
after adding a new month or editing the raw files.

To add a month: drop the new CSV in `data/raw/`, add an entry to the `MONTHS`
array in `scripts/build-data.mjs`, and rebuild.

## Files

| Path | Purpose |
| --- | --- |
| `index.html` | Page structure and copy |
| `styles.css` | Chaotic Era brand styling |
| `chart.js` | D3 multi-line charts + highlight controller |
| `app.js` | Data load, account directory, legend toggles, search |
| `scripts/build-data.mjs` | CSV → `data/timeseries.json` |
| `scripts/serve.mjs` | Local static preview server |
| `data/raw/*.csv` | Monthly source snapshots |
| `data/timeseries.json` | Built data consumed by the page |

## Notes

- Charts use a **linear** vertical scale anchored at zero, so vertical distance
  is proportional to the actual value (100M→1B spans ten times the height of
  1M→10M). The largest accounts therefore sit well above the rest.
- Only consistently active accounts are charted: present in **every** month and
  receiving at least **500,000 views** in **every** month. Accounts that miss any
  month or fall below that threshold are dropped by `scripts/build-data.mjs`
  (tune `MIN_VIEWS`, or add names to the `ALLOW` set to always include them).
- **Partisan lean** is a subjective editorial judgment by Chaotic Era, not a
  scientific measure.

Built by [Chaotic Era](https://chaoticera.news) — politics, media & online
influence by Kyle Tharp.

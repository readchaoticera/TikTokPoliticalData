#!/usr/bin/env node
/**
 * Build data/timeseries.json from the monthly TikTok exports in data/raw/.
 *
 * Each raw CSV is a monthly snapshot of the biggest political TikTok accounts
 * with columns:
 *   entity, political_lean, rank_change, total_engagements, engagements_change,
 *   posts, avg_engagements, total_views, Non_Twitter_Views, platforms
 *
 * We pivot these monthly snapshots into one record per account carrying a
 * value-per-month for each of the three metrics we chart (posts, views,
 * engagements), plus the account's partisan lean and its TikTok URL.
 *
 * Re-run after editing anything in data/raw/:
 *   npm run build      (or: node scripts/build-data.mjs)
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Monthly files in chronological order. key is an ISO-ish sortable month id;
// label is what the UI shows on the x-axis.
const MONTHS = [
  { file: "MAY_2025.csv", key: "2025-05", label: "May 2025", short: "May" },
  { file: "JUNE_2025.csv", key: "2025-06", label: "June 2025", short: "Jun" },
  { file: "JULY_2025.csv", key: "2025-07", label: "July 2025", short: "Jul" },
  { file: "AUGUST_2025.csv", key: "2025-08", label: "August 2025", short: "Aug" },
  { file: "SEPTEMBER_2025.csv", key: "2025-09", label: "September 2025", short: "Sep" },
  { file: "OCTOBER_2025.csv", key: "2025-10", label: "October 2025", short: "Oct" },
  { file: "NOVEMBER_2025.csv", key: "2025-11", label: "November 2025", short: "Nov" },
  { file: "DECEMBER_2025.csv", key: "2025-12", label: "December 2025", short: "Dec" },
  { file: "JANUARY_2026.csv", key: "2026-01", label: "January 2026", short: "Jan" },
  { file: "FEBRUARY_2026.csv", key: "2026-02", label: "February 2026", short: "Feb" },
];

// Map the source lean labels onto the brand's three-bucket scheme.
const LEAN_MAP = {
  "left-leaning": "left",
  left: "left",
  neutral: "neutral",
  "right-leaning": "right",
  right: "right",
};

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

// Minimal RFC-4180 CSV parser: handles quoted fields, embedded commas, and
// doubled "" escapes. Returns an array of row arrays.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v !== "")) rows.push(row);
  }
  return rows;
}

function toInt(raw) {
  const s = String(raw || "").replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Pull the first TikTok URL out of the markdown-ish platforms cell, e.g.
// "[TikTok](https://tiktok.com/@cbsnews), [TikTok](https://www.tiktok.com/@cbs)".
function firstTikTokUrl(platforms) {
  const m = String(platforms || "").match(/\((https?:\/\/[^)]+)\)/);
  return m ? m[1].trim() : null;
}

async function main() {
  const accounts = new Map(); // normalized name -> record

  for (const month of MONTHS) {
    const text = await readFile(resolve(ROOT, "data/raw", month.file), "utf8");
    const rows = parseCSV(text);
    if (!rows.length) continue;
    const header = rows[0].map((h) => h.trim());
    const idx = (name) => header.indexOf(name);
    const iEntity = idx("entity");
    const iLean = idx("political_lean");
    const iEng = idx("total_engagements");
    const iPosts = idx("posts");
    const iViews = idx("total_views");
    const iPlatforms = idx("platforms");

    for (const cols of rows.slice(1)) {
      const name = (cols[iEntity] || "").trim();
      if (!name) continue;
      const key = norm(name);
      let rec = accounts.get(key);
      if (!rec) {
        rec = {
          name,
          url: null,
          lean: "neutral",
          posts: {},
          views: {},
          engagements: {},
        };
        accounts.set(key, rec);
      }
      // Keep the most recent month's display name, lean, and URL.
      rec.name = name;
      rec.lean = LEAN_MAP[norm(cols[iLean])] || "neutral";
      const url = firstTikTokUrl(cols[iPlatforms]);
      if (url) rec.url = url;

      const posts = toInt(cols[iPosts]);
      const views = toInt(cols[iViews]);
      const eng = toInt(cols[iEng]);
      if (posts != null) rec.posts[month.key] = posts;
      if (views != null) rec.views[month.key] = views;
      if (eng != null) rec.engagements[month.key] = eng;
    }
  }

  const list = [...accounts.values()].sort((a, b) => {
    const av = lastValue(a.views);
    const bv = lastValue(b.views);
    return bv - av;
  });

  const out = {
    title: "Political TikTok — Monthly Trends",
    source: "Chaotic Era monthly TikTok exports",
    generatedAt: new Date().toISOString(),
    months: MONTHS.map(({ key, label, short }) => ({ key, label, short })),
    metrics: {
      posts: "Total posts published by the account during the month.",
      views: "Total views the account's content received during the month.",
      engagements: "Total engagements (likes, comments, shares, saves) during the month.",
    },
    leans: { left: "Left-Leaning", neutral: "Neutral", right: "Right-Leaning" },
    count: list.length,
    accounts: list,
  };

  await writeFile(resolve(ROOT, "data/timeseries.json"), JSON.stringify(out) + "\n");

  const leanCounts = list.reduce((m, a) => ((m[a.lean] = (m[a.lean] || 0) + 1), m), {});
  console.log(
    `Wrote data/timeseries.json — ${list.length} accounts across ${MONTHS.length} months ` +
      `(left ${leanCounts.left || 0}, neutral ${leanCounts.neutral || 0}, right ${leanCounts.right || 0}).`
  );
}

// Most recent non-null monthly value of a {monthKey: value} map (for default sort).
function lastValue(map) {
  for (let i = MONTHS.length - 1; i >= 0; i--) {
    const v = map[MONTHS[i].key];
    if (v != null) return v;
  }
  return 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

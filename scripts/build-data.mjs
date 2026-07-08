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
  // short labels carry the year at each year boundary (Oct ’24, Jan ’25, Jan ’26)
  // so the repeated months read unambiguously across the year changes.
  { file: "OCTOBER_2024.csv", key: "2024-10", label: "October 2024", short: "Oct ’24" },
  { file: "NOVEMBER_2024.csv", key: "2024-11", label: "November 2024", short: "Nov" },
  { file: "DECEMBER_2024.csv", key: "2024-12", label: "December 2024", short: "Dec" },
  { file: "JANUARY_2025.csv", key: "2025-01", label: "January 2025", short: "Jan ’25" },
  { file: "FEBRUARY_2025.csv", key: "2025-02", label: "February 2025", short: "Feb" },
  { file: "MARCH_2025.csv", key: "2025-03", label: "March 2025", short: "Mar" },
  { file: "APRIL_2025.csv", key: "2025-04", label: "April 2025", short: "Apr" },
  { file: "MAY_2025.csv", key: "2025-05", label: "May 2025", short: "May" },
  { file: "JUNE_2025.csv", key: "2025-06", label: "June 2025", short: "Jun" },
  { file: "JULY_2025.csv", key: "2025-07", label: "July 2025", short: "Jul" },
  { file: "AUGUST_2025.csv", key: "2025-08", label: "August 2025", short: "Aug" },
  { file: "SEPTEMBER_2025.csv", key: "2025-09", label: "September 2025", short: "Sep" },
  { file: "OCTOBER_2025.csv", key: "2025-10", label: "October 2025", short: "Oct" },
  { file: "NOVEMBER_2025.csv", key: "2025-11", label: "November 2025", short: "Nov" },
  { file: "DECEMBER_2025.csv", key: "2025-12", label: "December 2025", short: "Dec" },
  { file: "JANUARY_2026.csv", key: "2026-01", label: "January 2026", short: "Jan ’26" },
  { file: "FEBRUARY_2026.csv", key: "2026-02", label: "February 2026", short: "Feb" },
  { file: "MARCH_2026.csv", key: "2026-03", label: "March 2026", short: "Mar" },
  { file: "APRIL_2026.csv", key: "2026-04", label: "April 2026", short: "Apr" },
  { file: "MAY_2026.csv", key: "2026-05", label: "May 2026", short: "May" },
  // June 2026 comes from a broader "top entities across platforms" export, so an
  // account being absent here doesn't disqualify it — qualify:false keeps it out
  // of the every-month inclusion test while still displaying June data where present.
  { file: "JUNE_2026.csv", key: "2026-06", label: "June 2026", short: "Jun", qualify: false },
];

// Accounts to exclude entirely (normalized names).
const EXCLUDE = new Set();
// Accounts to always include, even if they miss the every-month thresholds
// below. Their line simply breaks for any month with no data.
const ALLOW = new Set(["fox news", "team trump", "headquarters"]);
// Display-name overrides, keyed by the normalized source name.
const RENAME = { headquarters: "KamalaHQ/Headquarters" };

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
      if (EXCLUDE.has(key)) continue;
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

  // Keep only consistently active accounts: present every month with a value
  // for every metric, AND receiving at least MIN_VIEWS views in EVERY month.
  // This drops one-off and low-volume accounts so each line is a continuous,
  // meaningful series.
  const MIN_VIEWS = 500000;
  const QUALIFY = MONTHS.filter((m) => m.qualify !== false);
  const complete = [...accounts.values()].filter(
    (a) =>
      ALLOW.has(norm(a.name)) ||
      QUALIFY.every((m) => a.views[m.key] >= MIN_VIEWS && a.posts[m.key] > 0 && a.engagements[m.key] > 0)
  );
  const dropped = accounts.size - complete.length;

  const list = complete.sort((a, b) => {
    const av = lastValue(a.views);
    const bv = lastValue(b.views);
    return bv - av;
  });

  // Apply display-name overrides (after filtering, which matches source names).
  for (const a of list) {
    const renamed = RENAME[norm(a.name)];
    if (renamed) a.name = renamed;
  }

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
    `Wrote data/timeseries.json — ${list.length} accounts (qualified over ${QUALIFY.length} months, ${MONTHS.length} displayed) ` +
      `(left ${leanCounts.left || 0}, neutral ${leanCounts.neutral || 0}, right ${leanCounts.right || 0}); ` +
      `dropped ${dropped} below the every-month threshold (>=${MIN_VIEWS.toLocaleString()} views).`
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

/* Chaotic Era — Political TikTok Trends front-end.
   Loads data/timeseries.json, renders the account directory, wires the legend
   toggles and search box, and coordinates highlighting with the charts. */
(() => {
  "use strict";

  const DATA_URL = "data/timeseries.json";
  const LEAN_LABEL = { left: "Left-Leaning", neutral: "Neutral", right: "Right-Leaning" };
  const NF = new Intl.NumberFormat("en-US");

  const state = {
    data: null,
    charts: null,
    visibleLeans: new Set(["left", "neutral", "right"]),
    filter: "",
  };

  const els = {
    dirList: document.getElementById("dir-list"),
    dirEmpty: document.getElementById("dir-empty"),
    meta: document.getElementById("meta"),
    banner: document.getElementById("banner"),
    search: document.getElementById("search"),
    legend: document.getElementById("legend"),
    charts: document.querySelectorAll(".chart"),
  };

  function abbr(n) {
    if (n == null) return "—";
    const a = Math.abs(n);
    if (a >= 1e9) return strip(n / 1e9) + "B";
    if (a >= 1e6) return strip(n / 1e6) + "M";
    if (a >= 1e3) return strip(n / 1e3) + "K";
    return String(Math.round(n));
  }
  const strip = (x) => String(Math.round(x * 10) / 10);

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  const nameKey = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

  // Most recent non-null monthly value for a metric map.
  function latest(map) {
    const months = state.data.months;
    for (let i = months.length - 1; i >= 0; i--) {
      const v = map[months[i].key];
      if (v != null) return v;
    }
    return null;
  }

  function handle(url) {
    try {
      const p = new URL(url).pathname.replace(/^\/+|\/+$/g, "");
      return p || url;
    } catch {
      return "TikTok ↗";
    }
  }

  function rowHTML(acct) {
    const url = acct.url;
    const nameInner = url
      ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener" title="${escapeHTML(handle(url))}">${escapeHTML(acct.name)}</a>`
      : `<span>${escapeHTML(acct.name)}</span>`;
    return `<div class="dir-row" data-id="${acct._id}">
        <span class="dir-name"><i class="swatch" style="background:${leanColor(acct.lean)}"></i>${nameInner}</span>
        <span class="dir-stat" title="Posts (latest month)"><b>${abbr(latest(acct.posts))}</b> posts</span>
        <span class="dir-stat opt" title="Views (latest month)"><b>${abbr(latest(acct.views))}</b> views</span>
        <span class="dir-stat opt" title="Engagements (latest month)"><b>${abbr(latest(acct.engagements))}</b> eng</span>
        <span class="dir-stat" title="Partisan lean">${LEAN_LABEL[acct.lean]}</span>
      </div>`;
  }

  function leanColor(l) {
    return { left: "#419eff", neutral: "#9aa6b2", right: "#fa2c5d" }[l] || "#9aa6b2";
  }

  function visibleAccounts() {
    const f = state.filter;
    return state.data.accounts.filter((a) => {
      if (!state.visibleLeans.has(a.lean)) return false;
      // Match on the display name OR the TikTok handle in the URL.
      if (f && !(nameKey(a.name).includes(f) || (a.url || "").toLowerCase().includes(f))) return false;
      return true;
    });
  }

  function renderDirectory() {
    const list = visibleAccounts();
    els.dirList.innerHTML =
      `<div class="dir-row dir-head">
        <span>Account</span><span>Posts</span><span class="opt">Views</span>
        <span class="opt">Eng.</span><span>Lean</span>
      </div>` + list.map(rowHTML).join("");
    els.dirEmpty.hidden = list.length > 0;
    els.dirList.hidden = list.length === 0;

    const when = state.data.generatedAt
      ? `updated ${new Date(state.data.generatedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}`
      : "";
    els.meta.textContent = `${list.length} of ${state.data.count} accounts${when ? " · " + when : ""}`;

    // Hovering a directory row traces that account across all three charts.
    els.dirList.querySelectorAll(".dir-row[data-id]").forEach((row) => {
      const id = Number(row.dataset.id);
      row.addEventListener("mouseenter", () => {
        setActiveRow(row);
        state.charts && state.charts.highlight([id]);
      });
      row.addEventListener("mouseleave", () => {
        setActiveRow(null);
        state.charts && state.charts.clear();
      });
    });
    postHeight();
  }

  let activeRow = null;
  function setActiveRow(row) {
    if (activeRow) activeRow.classList.remove("is-active");
    activeRow = row;
    if (row) row.classList.add("is-active");
  }

  // When hovering a chart line, mirror the highlight onto its directory row.
  // (No scrolling — the chart tooltip already names the account in place.)
  function onChartHover(acct) {
    const row = els.dirList.querySelector(`.dir-row[data-id="${acct._id}"]`);
    setActiveRow(row || null);
  }
  function onChartLeave() {
    setActiveRow(null);
  }

  function applyLeanClasses() {
    const cls = {
      left: "hide-left",
      neutral: "hide-neutral",
      right: "hide-right",
    };
    els.charts.forEach((c) => {
      Object.entries(cls).forEach(([lean, klass]) => {
        c.classList.toggle(klass, !state.visibleLeans.has(lean));
      });
    });
    state.charts && state.charts.setVisibleLeans(state.visibleLeans);
  }

  function wireLegend() {
    els.legend.querySelectorAll(".lg-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const lean = btn.dataset.lean;
        if (state.visibleLeans.has(lean)) {
          // Don't allow hiding the last visible group.
          if (state.visibleLeans.size === 1) return;
          state.visibleLeans.delete(lean);
          btn.classList.remove("is-on");
        } else {
          state.visibleLeans.add(lean);
          btn.classList.add("is-on");
        }
        applyLeanClasses();
        renderDirectory();
      });
    });
    // Lean counts in the legend.
    const counts = state.data.accounts.reduce((m, a) => ((m[a.lean] = (m[a.lean] || 0) + 1), m), {});
    document.querySelectorAll(".lg-count").forEach((el) => {
      const n = counts[el.dataset.count] || 0;
      el.textContent = ` (${n})`;
    });
  }

  // Auto-resize embeds: report document height to a parent frame.
  function postHeight() {
    try {
      if (window.parent && window.parent !== window) {
        const h = Math.ceil(document.documentElement.getBoundingClientRect().height);
        window.parent.postMessage({ type: "chaoticera-embed-height", height: h }, "*");
      }
    } catch (e) {}
  }

  async function getJSON(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function init() {
    let data;
    try {
      data = await getJSON(DATA_URL);
    } catch (err) {
      els.banner.hidden = false;
      els.banner.innerHTML = `Could not load <code>${DATA_URL}</code> (${escapeHTML(
        err.message
      )}). Run <code>npm run build</code>.`;
      return;
    }
    state.data = data;

    state.charts = window.createTikTokCharts(data, {
      onHover: onChartHover,
      onLeave: onChartLeave,
    });

    wireLegend();
    applyLeanClasses();
    renderDirectory();

    els.search.addEventListener("input", (e) => {
      state.filter = nameKey(e.target.value);
      renderDirectory();
      // Reflect search matches on the charts when the set is small enough to read.
      const matches = visibleAccounts();
      if (state.filter && matches.length > 0 && matches.length <= 30) {
        state.charts.highlight(matches.map((a) => a._id));
      } else {
        state.charts.clear();
      }
    });

    if (window.parent && window.parent !== window) {
      window.addEventListener("load", postHeight);
      window.addEventListener("resize", postHeight);
      if (window.ResizeObserver) new ResizeObserver(postHeight).observe(document.body);
      setTimeout(postHeight, 600);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();

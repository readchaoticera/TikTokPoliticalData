/* Chaotic Era — Political TikTok monthly trend charts.
   Renders three longitudinal multi-line charts (posts, views, engagements),
   one line per account, coloured by partisan lean. Exposes a small controller
   (window.createTikTokCharts) so app.js can coordinate highlighting between the
   charts and the account directory. */
(() => {
  "use strict";

  const COLORS = { left: "#419eff", neutral: "#9aa6b2", right: "#fa2c5d" };
  const LEAN_LABEL = { left: "Left-Leaning", neutral: "Neutral", right: "Right-Leaning" };
  const NF = new Intl.NumberFormat("en-US");

  function abbr(n) {
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

  // Build one chart for a given metric ("posts" | "views" | "engagements").
  function buildChart(el, data, metric, onHighlight, onLeave, onLock) {
    const months = data.months;
    const W = 940;
    const H = 380;
    const m = { top: 16, right: 18, bottom: 30, left: 56 };

    // Series: { acct, points:[{mi, v}] } for accounts with >=1 value for metric.
    const series = [];
    let minV = Infinity;
    let maxV = -Infinity;
    data.accounts.forEach((acct) => {
      const pts = [];
      months.forEach((mo, mi) => {
        const v = acct[metric][mo.key];
        if (v != null && v > 0) {
          pts.push({ mi, v });
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
      });
      if (pts.length) series.push({ acct, points: pts });
    });
    if (!isFinite(minV)) {
      minV = 1;
      maxV = 10;
    }

    const x = d3.scalePoint().domain(months.map((_, i) => i)).range([m.left, W - m.right]).padding(0.5);
    // Linear scale anchored at 0 so vertical distance is proportional to the
    // actual value (a jump from 1M→10M looks far smaller than 100M→1B).
    const y = d3.scaleLinear().domain([0, maxV]).range([H - m.bottom, m.top]).nice();

    const svg = d3
      .select(el)
      .append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("class", "chart-svg")
      .attr("role", "img")
      .attr("aria-label", `${metric} per month for ${series.length} political TikTok accounts, coloured by partisan lean`);

    // Evenly spaced linear gridlines.
    const yTicks = y.ticks(6);
    svg
      .append("g")
      .attr("class", "grid")
      .selectAll("line")
      .data(yTicks)
      .join("line")
      .attr("x1", m.left)
      .attr("x2", W - m.right)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d));

    // Y axis
    svg
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).tickValues(yTicks).tickFormat(abbr).tickSize(0).tickPadding(8))
      .call((g) => g.select(".domain").remove());

    // X axis
    svg
      .append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${H - m.bottom})`)
      .call(d3.axisBottom(x).tickFormat((i) => months[i].short).tickSize(0).tickPadding(8))
      .call((g) => g.select(".domain").remove());

    const line = d3
      .line()
      .x((d) => x(d.mi))
      .y((d) => y(d.v))
      .curve(d3.curveMonotoneX);

    // Baseline faint lines + dots for single-point series.
    const linesG = svg.append("g").attr("class", "lines");
    linesG
      .selectAll("path")
      .data(series.filter((s) => s.points.length >= 2))
      .join("path")
      .attr("class", (s) => `ln lean-${s.acct.lean}`)
      .attr("d", (s) => line(s.points));
    linesG
      .selectAll("circle")
      .data(series.filter((s) => s.points.length === 1))
      .join("circle")
      .attr("class", (s) => `dotpt lean-${s.acct.lean}`)
      .attr("cx", (s) => x(s.points[0].mi))
      .attr("cy", (s) => y(s.points[0].v))
      .attr("r", 2.4);

    // Overlay layer for highlighted account(s).
    const overlay = svg.append("g").attr("class", "overlay");
    const tip = d3.select(el).append("div").attr("class", "chart-tip");

    // Precompute pixel positions per month for nearest-line hit testing.
    const byMonth = months.map(() => []);
    series.forEach((s, si) => {
      s.points.forEach((p) => byMonth[p.mi].push({ si, py: y(p.v), v: p.v }));
    });

    // Track which leans are visible (mirrors legend toggles) for hit-testing,
    // and which series (if any) is currently locked open by a click.
    let currentVisibleLeans = new Set(["left", "neutral", "right"]);
    let lockedSi = null;

    // Draw the bold highlight overlay for a set of series indices, and toggle
    // the dimming of the rest of the field.
    function drawLines(ids) {
      overlay.selectAll("*").remove();
      const focused = ids && ids.length;
      el.classList.toggle("is-focused", !!focused);
      if (!focused) return;
      ids.forEach((si) => {
        const s = series[si];
        if (!s) return;
        const color = COLORS[s.acct.lean] || COLORS.neutral;
        if (s.points.length >= 2) {
          overlay.append("path").attr("class", "hl-line").attr("stroke", color).attr("d", line(s.points));
        }
        overlay
          .selectAll(null)
          .data(s.points)
          .join("circle")
          .attr("class", "hl-dot")
          .attr("fill", color)
          .attr("cx", (p) => x(p.mi))
          .attr("cy", (p) => y(p.v))
          .attr("r", 3.4);
      });
    }

    // Show the tooltip for one series at a given month. `anchor` is either the
    // cursor position (free hover) or the data point itself (locked, so it
    // tracks the month you point at).
    function showTip(si, mi, anchor, locked) {
      const s = series[si];
      const pt = s.points.find((p) => p.mi === mi) || s.points[s.points.length - 1];
      const hint = locked
        ? "click again or press Esc to unlock"
        : "click to lock · open in the list below";
      tip
        .html(
          `<strong>${escapeHTML(s.acct.name)}</strong><br>` +
            `${months[pt.mi].label}: ${NF.format(pt.v)} ${metric}` +
            `<span class="tip-lean">${LEAN_LABEL[s.acct.lean]} · ${hint}</span>`
        )
        .style("opacity", 1);
      const rect = el.getBoundingClientRect();
      const ax = anchor.mode === "cursor" ? anchor.mx : x(pt.mi);
      const ay = anchor.mode === "cursor" ? anchor.my : y(pt.v);
      const cx = (ax / W) * rect.width;
      const cy = (ay / H) * rect.height;
      const tw = tip.node().offsetWidth;
      const th = tip.node().offsetHeight;
      let left = cx + 16;
      if (left + tw > rect.width - 4) left = cx - tw - 16;
      left = Math.max(4, Math.min(left, rect.width - tw - 4));
      let top = cy - th - 14;
      if (top < 4) top = cy + 18;
      top = Math.max(4, Math.min(top, rect.height - th - 4));
      tip.style("left", left + "px").style("top", top + "px");
    }
    const hideTip = () => tip.style("opacity", 0);

    const nearestMonth = (mx) => {
      let mi = 0;
      let best = Infinity;
      months.forEach((_, i) => {
        const d = Math.abs(mx - x(i));
        if (d < best) {
          best = d;
          mi = i;
        }
      });
      return mi;
    };

    // Nearest visible series to (mi, my); returns { si, dist } (dist in SVG units).
    function pickSeries(mi, my) {
      let si = -1;
      let dist = Infinity;
      for (const cand of byMonth[mi]) {
        if (!currentVisibleLeans.has(series[cand.si].acct.lean)) continue;
        const d = Math.abs(my - cand.py);
        if (d < dist) {
          dist = d;
          si = cand.si;
        }
      }
      return { si, dist };
    }

    // Interaction surface.
    svg
      .append("rect")
      .attr("class", "interaction")
      .attr("x", m.left)
      .attr("y", m.top)
      .attr("width", W - m.left - m.right)
      .attr("height", H - m.top - m.bottom)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousemove", function (event) {
        const [mx, my] = d3.pointer(event, svg.node());
        const mi = nearestMonth(mx);
        if (lockedSi != null) {
          // Locked: keep this line up; just read off the month under the cursor.
          showTip(lockedSi, mi, { mode: "point" }, true);
          return;
        }
        const { si } = pickSeries(mi, my);
        if (si >= 0) {
          drawLines([si]);
          showTip(si, mi, { mode: "cursor", mx, my }, false);
          onHighlight && onHighlight(series[si].acct);
        }
      })
      .on("mouseleave", function () {
        if (lockedSi != null) {
          hideTip(); // keep the locked line, just drop the tooltip
          return;
        }
        drawLines(null);
        hideTip();
        onLeave && onLeave();
      })
      .on("click", function (event) {
        const [mx, my] = d3.pointer(event, svg.node());
        const mi = nearestMonth(mx);
        const { si, dist } = pickSeries(mi, my);
        // Clicking the locked line again, or clicking empty space, unlocks.
        let target;
        if (si < 0 || dist > 18) target = null;
        else if (lockedSi === si) target = null;
        else target = si;
        onLock && onLock(target == null ? null : series[target].acct);
      });

    return {
      metric,
      seriesIndexByName: (() => {
        const map = new Map();
        series.forEach((s, i) => map.set(s.acct._id, i));
        return map;
      })(),
      // External (row hover / search) highlight — ignored while a line is locked.
      highlight(ids) {
        if (lockedSi != null) return;
        drawLines(ids);
      },
      clear() {
        if (lockedSi != null) return;
        drawLines(null);
        hideTip();
      },
      setLocked(si) {
        lockedSi = si;
        el.classList.toggle("is-locked", si != null);
        if (si == null) {
          drawLines(null);
          hideTip();
        } else {
          drawLines([si]);
        }
      },
      setVisibleLeans(set) {
        currentVisibleLeans = set;
      },
    };
  }

  window.createTikTokCharts = function (data, hooks) {
    // Assign a stable id to each account for cross-chart lookup.
    data.accounts.forEach((a, i) => (a._id = i));

    const make = (id, metric) =>
      buildChart(document.getElementById(id), data, metric, hooks.onHover, hooks.onLeave, hooks.onLock);
    const charts = [
      make("chart-posts", "posts"),
      make("chart-views", "views"),
      make("chart-engagements", "engagements"),
    ];

    return {
      // Highlight a set of account ids across every chart.
      highlight(accountIds) {
        charts.forEach((c) => {
          const ids = accountIds.map((id) => c.seriesIndexByName.get(id)).filter((v) => v != null);
          c.highlight(ids);
        });
      },
      clear() {
        charts.forEach((c) => c.clear());
      },
      // Lock (freeze) one account across every chart, or null to release.
      setLocked(accountId) {
        charts.forEach((c) => {
          const si = accountId == null ? null : c.seriesIndexByName.get(accountId);
          c.setLocked(si == null ? null : si);
        });
      },
      setVisibleLeans(set) {
        charts.forEach((c) => c.setVisibleLeans(set));
      },
    };
  };
})();

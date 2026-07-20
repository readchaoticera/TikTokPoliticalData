# Embedding the leaderboard

The page has a built-in embed mode: add `?embed=1` to the URL and it hides the
Chaotic Era masthead/footer and reports its height to the parent window so the
iframe can auto-resize.

**Live URL** (GitHub Pages): `https://readchaoticera.github.io/TikTokPoliticalData/`
**Embed URL:** `https://readchaoticera.github.io/TikTokPoliticalData/?embed=1`

> Requires GitHub Pages to be enabled for this repo (Settings → Pages → Deploy
> from a branch → `claude/wonderful-babbage-t3jn00`, folder `/`). See README.

---

## Option A — auto-resizing embed (recommended)

Paste on any site/page that allows custom HTML + JavaScript. The little script
listens for the height the page broadcasts and sizes the iframe to fit, so there
is no inner scrollbar.

```html
<div style="max-width:1120px;margin:0 auto;">
  <iframe
    id="chaotic-tiktok"
    src="https://readchaoticera.github.io/TikTokPoliticalData/?embed=1"
    title="News & Politics Trends on TikTok — Chaotic Era"
    loading="lazy"
    scrolling="no"
    style="width:100%;height:2600px;border:0;overflow:hidden;"
  ></iframe>
</div>
<script>
  window.addEventListener("message", function (e) {
    if (e.origin !== "https://readchaoticera.github.io") return;
    if (e.data && e.data.type === "chaoticera-embed-height") {
      var f = document.getElementById("chaotic-tiktok");
      if (f) f.style.height = e.data.height + "px";
    }
  });
</script>
```

## Option B — simple fixed-height iframe (no JavaScript)

For editors that strip `<script>`. Height is fixed, so pick a value tall enough
for your layout (the directory has its own inner scroll).

```html
<iframe
  src="https://readchaoticera.github.io/TikTokPoliticalData/?embed=1"
  title="News & Politics Trends on TikTok — Chaotic Era"
  loading="lazy"
  style="width:100%;height:2600px;border:0;"
></iframe>
```

---

## Note on Substack

Substack's **post editor strips custom `<iframe>`/`<script>`**, so pasting the
code above into a normal post will not render the interactive chart. Practical
options on Substack:

1. **Best interactive route:** embed the iframe on a page you *do* control
   (a custom site, Webflow/WordPress/Framer landing page, etc.), or on Substack
   only if your plan exposes a custom-HTML block.
2. **In a Substack post:** drop in a **screenshot/GIF of the charts that links to
   the live URL** above — readers click through to the interactive version.
3. Pasting the raw URL into a post yields an auto link-preview card.

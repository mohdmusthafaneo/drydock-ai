#!/usr/bin/env node
/**
 * Produces a fast-loading public/landing.html from portkey.html.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "public", "portkey.html");
const outputPath = path.join(root, "public", "landing.html");

const HERO_VIDEO = "/marketing/cfassets/hero_fold-observability.mp4";

const TEXT_REPLACEMENTS = [
  [/Portkey/g, "AIDOS"],
  [/portkey(?=\.ai)/gi, "aidos"],
];

const LANDING_VISUAL_FIXES = `<style id="aidos-landing-visual-fixes">
  /* Framer appear scripts were removed — restore hero gradients */
  .framer-in38f9,
  .framer-14cmvl9,
  [data-framer-name="Gradient"],
  [data-framer-name="Home Page Hero Grad"],
  [data-framer-name="Hero Gradiend BG"] {
    opacity: 1 !important;
    visibility: visible !important;
  }
  .framer-in38f9 {
    transform: none !important;
  }
  .framer-rrcb57-container {
    position: relative;
    z-index: 2;
  }
  /* Large Portkey/AIDOS wordmark belongs in hero only — hide in SSO block */
  .framer-etcpnc .framer-10cln9b,
  .framer-etcpnc .framer-glu4pu-container,
  .framer-etcpnc img[src*="homepage-1.svg"] {
    display: none !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
  /* Subtle SSO panel glow (matches testimonial column) */
  .framer-etcpnc {
    background: radial-gradient(
      120% 80% at 80% 50%,
      rgba(7, 144, 213, 0.18) 0%,
      rgba(255, 15, 0, 0.08) 45%,
      transparent 70%
    ) !important;
  }
  /* Compact sticky header (~56–64px) — Portkey-style */
  .framer-41ttj2-container {
    height: auto !important;
  }
  .framer-wuL2o[data-framer-name="Ultra HD HB"],
  .framer-wuL2o.framer-1dlovx7 {
    height: auto !important;
    min-height: 0 !important;
  }
  .framer-wuL2o .framer-2kvpfg-container,
  .framer-wuL2o [data-framer-name="Hello Bar HD"],
  .framer-wuL2o [data-framer-name^="Hello Bar"] {
    display: none !important;
    height: 0 !important;
    min-height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
    padding: 0 !important;
    margin: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
  .framer-wuL2o .framer-10zxrve {
    padding: 8px 24px !important;
    max-width: 1280px !important;
    width: 100% !important;
    min-height: 48px !important;
    box-sizing: border-box !important;
  }
  .framer-wuL2o [data-framer-name*="logo with download" i] img,
  .framer-wuL2o img[alt="Logo"],
  .framer-wuL2o img[alt="AIDOS Logo"] {
    width: auto !important;
    max-width: 110px !important;
    height: 26px !important;
    max-height: 26px !important;
    object-fit: contain !important;
  }
  .framer-wuL2o .framer-13ftbqf-container,
  .framer-wuL2o .framer-17qrkha-container,
  .framer-wuL2o .framer-gb2o7h-container,
  .framer-wuL2o .framer-1j1qm44-container {
    height: auto !important;
    min-height: 0 !important;
  }
  .framer-wuL2o .framer-8dmj2p .framer-text {
    font-size: 14px !important;
    line-height: 1.25 !important;
  }
  .framer-wuL2o [data-framer-name="Nav Bar Button Primary"],
  .framer-wuL2o [data-framer-name="Nav Bar Button Secondary"],
  .framer-wuL2o [data-framer-name*="Nav Bar Button"] {
    min-height: 32px !important;
    height: 32px !important;
    padding: 0 14px !important;
    box-sizing: border-box !important;
  }
  .framer-wuL2o [data-framer-name*="Nav Bar Button"] .framer-text {
    font-size: 13px !important;
    line-height: 1.2 !important;
  }
  .framer-wuL2o .framer-z6vufw {
    gap: 10px !important;
  }
  @media (max-width: 767.98px) {
    .framer-wuL2o .framer-10zxrve {
      padding: 8px 16px !important;
    }
  }
</style>`;

const MINIMAL_OVERRIDES = `<script id="aidos-content-overrides">
document.addEventListener("DOMContentLoaded",function(){
  document.title="AI-Native Operational Governance | AIDOS";
  document.querySelectorAll('img[alt="Logo"]').forEach(function(img){
    var nav=img.closest('[data-framer-name*="logo with download" i]');
    if(!nav)return;
    img.src="/images/aidos-logo-nav.png";
    img.removeAttribute("srcset");
    img.alt="AIDOS Logo";
    img.style.width="auto";
    img.style.height="26px";
    img.style.maxHeight="26px";
    img.style.objectFit="contain";
  });
});
</script>`;

const HERO_VIDEO_LOADER = `<script id="aidos-hero-video">
document.addEventListener("DOMContentLoaded",function(){
  var src="${HERO_VIDEO}";
  var videos=document.querySelectorAll("video[data-aidos-hero]");
  for(var i=0;i<videos.length;i++){
    var v=videos[i],n=v,hidden=false;
    while(n){var s=getComputedStyle(n);if(s.display==="none"){hidden=true;break;}n=n.parentElement;}
    if(hidden)continue;
    v.src=src;v.muted=true;v.loop=true;v.playsInline=true;v.autoplay=true;v.preload="auto";
    v.play().catch(function(){});
    return;
  }
});
</script>`;

const MINIMAL_CTA = `<script id="aidos-cta-routing">
document.addEventListener("DOMContentLoaded",function(){
  document.querySelectorAll('a[href]').forEach(function(a){
    var h=a.getAttribute("href")||"";
    if(/book-a-demo|signup|app\\.portkey/i.test(h))a.setAttribute("href","/signup");
  });
});
</script>`;

function stripHeavyScripts(html) {
  let result = html;

  // Navbar blur + MutationObserver on entire body.
  result = result.replace(
    /<!-- Navbar hover blur effect -->[\s\S]*?<\/script>\s*/i,
    "",
  );

  // Framer motion animator (~11KB+).
  result = result.replace(
    /<script>var animator=\(\(\)=>[\s\S]*?<\/script>\s*/i,
    "",
  );

  // Framer appear animation payloads.
  result = result.replace(
    /<script type="framer\/appear"[\s\S]*?<\/script>\s*/gi,
    "",
  );
  result = result.replace(
    /<script data-framer-appear-animation[\s\S]*?<\/script>\s*/gi,
    "",
  );

  // Heavy runtime copy override (walks all text nodes).
  result = result.replace(
    /<script id="aidos-content-overrides">[\s\S]*?<\/script>\s*/i,
    `${MINIMAL_OVERRIDES}\n`,
  );

  // CTA routing with intervals.
  result = result.replace(
    /<script id="aidos-cta-routing">[\s\S]*?<\/script>\s*/i,
    `${MINIMAL_CTA}\n`,
  );

  // Broken hero video loader that strips all src attributes.
  result = result.replace(
    /<script id="aidos-hero-video">[\s\S]*?<\/script>\s*/gi,
    "",
  );

  // Cookie banner poller.
  result = result.replace(
    /<script>window\.__hideFramerCookieBanner[\s\S]*?<\/script>\s*/i,
    "",
  );

  // Framer hydration payload (not needed for static SSR page).
  result = result.replace(/\sdata-framer-hydrate-v2="[^"]*"/gi, "");

  return result;
}

function fixHeroVideos(html) {
  return html.replace(/<video\b([^>]*)>/gi, (tag, attrs) => {
    let next = attrs;
    next = next.replace(/\s+src="[^"]*"/gi, "");
    if (!/data-aidos-hero/.test(next)) {
      next += ' data-aidos-hero="true"';
    }
    if (!/preload=/.test(next)) {
      next += ' preload="none"';
    }
    if (!/muted/.test(next)) {
      next += " muted";
    }
    if (!/playsinline/.test(next)) {
      next += " playsinline";
    }
    if (!/loop/.test(next)) {
      next += " loop";
    }
    return `<video${next}>`;
  });
}

function applyTextReplacements(html) {
  let result = html;
  for (const [pattern, replacement] of TEXT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  // Framer SSR placeholders that resolve to broken requests.
  result = result.replace(/url\(undefined\)/gi, "none");
  result = result.replace(/\ssrc="undefined"/gi, "");
  return result;
}

/** Appear animations set opacity:0.001 — invisible after we strip the animator. */
function fixFramerAppearInitialState(html) {
  return html.replace(/opacity:0\.001/g, "opacity:1");
}

function injectVisualFixes(html) {
  if (html.includes('id="aidos-landing-visual-fixes"')) {
    return html.replace(
      /<style id="aidos-landing-visual-fixes">[\s\S]*?<\/style>/i,
      LANDING_VISUAL_FIXES,
    );
  }
  return html.replace(
    /<style id="aidos-hero-headline-style">/i,
    `${LANDING_VISUAL_FIXES}\n\t<style id="aidos-hero-headline-style">`,
  );
}

async function main() {
  let html = await readFile(sourcePath, "utf8");
  html = stripHeavyScripts(html);
  html = fixFramerAppearInitialState(html);
  html = fixHeroVideos(html);
  html = applyTextReplacements(html);
  html = injectVisualFixes(html);

  if (!html.includes("aidos-landing-optimized")) {
    html = html.replace(
      /<!-- aidos-landing-built -->/,
      "<!-- aidos-landing-built -->\n<!-- aidos-landing-optimized -->",
    );
  }

  html = html.replace(/<\/body>/i, `${HERO_VIDEO_LOADER}\n</body>`);

  await writeFile(outputPath, html, "utf8");
  console.log(
    `Wrote ${outputPath} (${(html.length / 1e6).toFixed(2)} MB, was ${(await readFile(sourcePath)).length / 1e6} MB source)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

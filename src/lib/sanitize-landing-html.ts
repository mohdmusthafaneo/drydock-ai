/**
 * Strips Framer client hydration and Portkey external dependencies from the
 * static marketing HTML so the page stays on our origin with no portkey.ai flash.
 */
const PORTKEY_HOST =
  /^(?:[a-z0-9-]+\.)*portkey\.ai$/i;

/** Local replacements for Portkey CDN paths (decoded path segments, lowercased). */
const CFASSETS_LOCAL: Array<{ test: (path: string) => boolean; local: string }> =
  [
    {
      test: (p) =>
        p.includes("hero_fold") && p.includes("observability.mp4"),
      local: "/marketing/cfassets/hero_fold-observability.mp4",
    },
  ];

const HERO_VIDEO_LOCAL = "/marketing/cfassets/hero_fold-observability.mp4";

const REMOVABLE_SCRIPT_PATTERNS: RegExp[] = [
  // Framer editor bootstrap
  /<script>try\{if\(localStorage\.get\("__framer_force_showing_editorbar_since"\)\)[\s\S]*?<\/script>\s*/i,
  // Google Tag Manager (Portkey site)
  /<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->\s*/i,
  // Microsoft Clarity
  /<script type="text\/javascript">\s*\(function\(c,l,a,r,i,t,y\)[\s\S]*?clarity[\s\S]*?<\/script>\s*/i,
  // Portkey hreflang injector
  /<script>\s*document\.addEventListener\('DOMContentLoaded', function\(\) \{\s*\/\/ Base URL[\s\S]*?addHreflangTags[\s\S]*?\}\);\s*<\/script>\s*/i,
  // Portkey JSON-LD
  /<script type="application\/ld\+json">\s*\{[\s\S]*?"name": "Portkey"[\s\S]*?<\/script>\s*/i,
  // gtag
  /<!-- Global site tag \(gtag\.js\)[\s\S]*?<\/script>\s*/i,
  /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js[^"]*"><\/script>\s*/i,
  /<script>\s*window\.dataLayer[\s\S]*?gtag\('config', 'G-JJMXYE4DRL'\);[\s\S]*?<\/script>\s*/i,
  // Framer analytics
  /<script async src="https:\/\/events\.framer\.com\/script[^"]*"[^>]*><\/script>\s*/gi,
  // Framer React hydration (canonical-domain redirect)
  /<script[^>]*data-framer-bundle="main"[^>]*><\/script>\s*/gi,
];

const REMOVABLE_LINK_PATTERNS: RegExp[] = [
  /<link rel="modulepreload"[^>]*href="https:\/\/framerusercontent\.com\/sites\/[^"]*"[^>]*>/gi,
];

const REMOVABLE_META_PATTERNS: RegExp[] = [
  /<meta name="framer-search-index"[^>]*>\s*/gi,
  /<meta name="framer-search-index-fallback"[^>]*>\s*/gi,
];

const ANTI_REDIRECT_SCRIPT = `<script id="aidos-landing-guard">(function(){var blocked=/^([a-z0-9-]+\\.)*portkey\\.ai$/i;function rewrite(url){try{var u=new URL(url,location.href);if(!blocked.test(u.hostname))return url;if(/signup/i.test(u.pathname))return"/signup";if(/book-a-demo|demo/i.test(u.pathname))return"/login";return location.origin+"/";}catch(e){return url;}}function patchAssign(proto,key){var orig=proto[key];if(typeof orig!=="function")return;proto[key]=function(url){return orig.call(this,rewrite(url));};}patchAssign(window.Location.prototype,"assign");patchAssign(window.Location.prototype,"replace");var open=window.open;window.open=function(url){var args=Array.prototype.slice.call(arguments);if(typeof args[0]==="string")args[0]=rewrite(args[0]);return open.apply(window,args);};document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;var href=a.getAttribute("href");if(!href)return;try{var u=new URL(href,location.href);if(blocked.test(u.hostname)){e.preventDefault();location.href=rewrite(href);}}catch(err){}},true);})();</script>`;

function mapPortkeyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!PORTKEY_HOST.test(parsed.hostname)) {
      return url;
    }
    const path = parsed.pathname.toLowerCase();
    if (path.includes("signup")) {
      return "/signup";
    }
    if (path.includes("book-a-demo") || path.includes("demo")) {
      return "/login";
    }
    if (path.includes("login") || path.includes("signin")) {
      return "/login";
    }
    return "#";
  } catch {
    return "#";
  }
}

function decodeCfassetPath(raw: string): string {
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function mapCfassetPath(encodedPath: string): string {
  const decoded = decodeCfassetPath(encodedPath);
  for (const entry of CFASSETS_LOCAL) {
    if (entry.test(decoded)) {
      return entry.local;
    }
  }
  return "#";
}

/** Map full cfassets.portkey.ai URLs before generic portkey stripping. */
function replaceCfassetsUrls(html: string): string {
  return html.replace(
    /https?:\/\/cfassets\.portkey\.ai\/([^"'<>]+)/gi,
    (_, path: string) => mapCfassetPath(path),
  );
}

/** Repair URLs broken when portkey.ai appeared inside cfassets host paths. */
function fixBrokenCfassetFragments(html: string): string {
  return html
    .replace(
      /#SITE%2FHOME%20PAGE%2FHero_Fold%2FObservability\.mp4/gi,
      HERO_VIDEO_LOCAL,
    )
    .replace(
      /<video([^>]*)\ssrc="#[^"]*Observability\.mp4"([^>]*)>/gi,
      `<video$1 src="${HERO_VIDEO_LOCAL}"$2>`,
    );
}

function replacePortkeyUrls(html: string): string {
  return html.replace(
    /https?:\/\/(?:[a-z0-9-]+\.)*portkey\.ai[^"'<>]*/gi,
    (match) => mapPortkeyUrl(match),
  );
}

function stripRemovableBlocks(html: string): string {
  let result = html;
  for (const pattern of [
    ...REMOVABLE_SCRIPT_PATTERNS,
    ...REMOVABLE_LINK_PATTERNS,
    ...REMOVABLE_META_PATTERNS,
  ]) {
    result = result.replace(pattern, "");
  }
  return result;
}

function fixDocumentMetadata(html: string): string {
  return html
    .replace(/\sdata-redirect-timezone="1"/i, "")
    .replace(
      /<link rel="canonical" href="https:\/\/portkey\.ai\/">/i,
      '<link rel="canonical" href="/">',
    )
    .replace(
      /<meta property="og:url" content="https:\/\/portkey\.ai\/">/i,
      '<meta property="og:url" content="/">',
    )
    .replace(/"name": "Portkey"/g, '"name": "AIDOS"');
}

function injectGuardScript(html: string): string {
  if (html.includes('id="aidos-landing-guard"')) {
    return html;
  }
  return html.replace(
    /<head>/i,
    `<head>\n\t${ANTI_REDIRECT_SCRIPT}`,
  );
}

export function sanitizeLandingHtml(html: string): string {
  let result = html;
  result = stripRemovableBlocks(result);
  result = fixDocumentMetadata(result);
  result = replaceCfassetsUrls(result);
  result = replacePortkeyUrls(result);
  result = fixBrokenCfassetFragments(result);
  result = injectGuardScript(result);
  return result;
}

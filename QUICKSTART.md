# Quickstart Guide

A step-by-step walkthrough for first-time users.

---

## What This Does

This library loads third-party scripts (analytics, ads, tracking pixels, etc.) based on:
- **Page targeting** - Only load on specific pages, sections, or geos
- **Consent** - Wait for user consent before loading
- **A/B testing** - Show different scripts to different user segments

---

## Step 1: Install and Build

```bash
npm install
npm run build
```

This creates two files in `dist/`:
- `pubsub.min.js` - Event system (load first)
- `plugin-loader.min.js` - The loader

---

## Step 2: Configure Your Dimensions

Dimensions are page values the loader uses for targeting. Edit `config/dimensions.json`:

```json
{
  "section": {
    "source": "meta",
    "key": "page-section",
    "matchType": "startsWith"
  },
  "pagetype": {
    "source": "window",
    "path": "dataLayer.pageType",
    "matchType": "exact"
  },
  "geo": {
    "source": "cookie",
    "key": "user_country",
    "matchType": "exact"
  }
}
```

**Source options:**
| Source | What it reads | Key/Path |
|--------|--------------|----------|
| `meta` | `<meta name="X">` | `key`: meta name |
| `window` | `window.X.Y.Z` | `path`: dot notation |
| `cookie` | Cookie value | `key`: cookie name |
| `queryParam` | URL `?param=` | `key`: param name |
| `localStorage` | localStorage | `key`: storage key |

**Match types:**
| Type | Matches |
|------|---------|
| `exact` | `"sport"` matches `"sport"` only |
| `startsWith` | `"sport"` matches `"sport"`, `"sport.football"`, `"sport.cricket"` |
| `includes` | `"sport"` matches anything containing `"sport"` |

---

## Step 3: Add Your Plugins

Edit `config/plugins.js`. Each plugin is a script to conditionally load:

```javascript
export default {

  // Example: Google Analytics - loads everywhere
  googleAnalytics: {
    name: 'googleAnalytics',
    active: true,
    url: 'https://www.googletagmanager.com/gtag/js?id=GA_ID',
    domains: ['all'],
    include: {
      section: ['all'],
      pagetype: ['all'],
      geo: ['all']
    },
    exclude: {}
  },

  // Example: Sports widget - only loads on sport pages
  sportsWidget: {
    name: 'sportsWidget',
    active: true,
    url: 'https://cdn.example.com/sports-widget.js',
    domains: ['all'],
    include: {
      section: ['sport'],
      pagetype: ['article'],
      geo: ['all']
    },
    exclude: {
      section: ['sport/betting']
    }
  },

  // Example: UK-only tracking pixel
  ukTracker: {
    name: 'ukTracker',
    active: true,
    url: 'https://cdn.example.com/uk-pixel.js',
    domains: ['all'],
    include: {
      section: ['all'],
      pagetype: ['all'],
      geo: ['gb']
    },
    exclude: {},
    consentState: ['analytics']
  }

};
```

---

## Step 4: Configure the Loader

Edit `config/loader.js`:

```javascript
export default {
  globalName: 'pluginLoader',    // Access via window.pluginLoader
  debugParam: 'pluginDebug',     // Add ?pluginDebug to URL for console logs
  readyTopic: 'cmp.ready',      // Wait for this event before loading (or null)
  pubsubGlobal: 'PubSub'        // Global PubSub instance name
};
```

**Key setting: `readyTopic`**
- Set to `'cmp.ready'` to wait for your CMP/consent manager
- Set to `null` to load plugins immediately on page load

---

## Step 5: Rebuild

After config changes:

```bash
npm run build
```

---

## Step 6: Add to Your Page

### Option A: Wait for CMP (Recommended)

```html
<!DOCTYPE html>
<html>
<head>
  <!-- 1. Load PubSub first (creates window.PubSub) -->
  <script src="pubsub.min.js"></script>

  <!-- 2. Your CMP loads and eventually signals ready -->
  <script src="your-cmp.js"></script>
</head>
<body>
  <!-- 3. Load plugin loader (waits for cmp.ready before loading plugins) -->
  <script src="plugin-loader.min.js"></script>
</body>
</html>
```

Your CMP signals ready:
```javascript
// Inside your CMP code, after consent is collected:
window.PubSub.publish({ topic: 'cmp.ready' });
```

### Option B: Load Immediately

Set `readyTopic: null` in `config/loader.js`, then:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="pubsub.min.js"></script>
</head>
<body>
  <script src="plugin-loader.min.js"></script>
</body>
</html>
```

### Load Order Flexibility

PubSub and the plugin loader can load in any order:

```html
<!-- This works -->
<script src="pubsub.min.js"></script>
<script src="plugin-loader.min.js"></script>

<!-- This also works -->
<script src="plugin-loader.min.js"></script>
<script src="pubsub.min.js"></script>
```

If PubSub loads after the plugin loader, the loader creates its own internal PubSub. The CMP just needs to publish to `window.PubSub` when ready.

If `cmp.ready` was already published before the plugin loader runs, it detects this and loads plugins immediately.

---

## Step 7: Debug

Add `?pluginDebug` to any URL to see console logs:

```
https://yoursite.com/page?pluginDebug
```

You'll see:
```
[123] Waiting for cmp.ready
[456] cmp.ready received, loading plugins
[457] Initializing with 3 plugins
[458] googleAnalytics: loaded
[459] sportsWidget: ignore    "Not included by section: news"
[460] ukTracker: loaded
```

---

## Step 8: Access the Loader

The loader is available globally:

```javascript
// Get all loaded plugins
window.pluginLoader.getMetrics();

// Get specific plugin
window.pluginLoader.getPlugin('googleAnalytics');

// View all logs
window.pluginLoader.logs;

// Check current page context
window.pluginLoader.getContext();
// { section: "news", pagetype: "article", geo: "gb" }
```

---

## Common Patterns

### Load on specific domains only

```javascript
{
  name: 'prodOnlyScript',
  domains: ['www.mysite.com'],  // Won't load on localhost or staging
  // ...
}
```

### Custom inclusion logic

```javascript
{
  name: 'loggedInOnly',
  include: {
    special: function() {
      return window.user?.isLoggedIn === true;
    }
  },
  // ...
}
```

### Custom exclusion logic

```javascript
{
  name: 'noBotsAllowed',
  exclude: {
    special: function() {
      return /bot|crawler|spider/i.test(navigator.userAgent);
    }
  },
  // ...
}
```

### Multiple sections with startsWith

With `matchType: "startsWith"` in dimensions.json:

```javascript
include: {
  section: ['sport']  // Matches: sport, sport/football, sport/cricket, etc.
}
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Plugins not loading | Add `?pluginDebug` to see why |
| "Waiting for cmp.ready" forever | Your CMP isn't publishing the event |
| Wrong targeting | Check `window.pluginLoader.getContext()` |
| Script 404 | Check the `url` in your plugin config |

---

## For Large Sites: Matrix Build

If you have 50+ plugins, use the matrix build for optimized loading.

### What It Does

Instead of bundling ALL plugins into one file, it creates bundles per dimension:
- `global.min.js` - Plugins that load everywhere
- `sport.min.js` - Plugins for sport section only
- `news.min.js` - Plugins for news section only
- etc.

The loader fetches only the bundles relevant to the current page.

### Configure

Edit `config/matrix.js`:

```javascript
export default {
  // Dimension(s) to bundle by
  // ["section"] → sport.js, news.js
  // ["section", "pagetype"] → sport-article.js, news-index.js
  bundleBy: ["section"],

  // true: Each bundle is standalone
  // false: Must load global.js + section bundle
  selfContained: true
};
```

### Build

```bash
npm run build:matrix
```

### Output

```
dist/
  plugin-loader-matrix.min.js   # Lightweight loader
  matrix/
    manifest.json
    global.min.js
    sport.min.js
    news.min.js
```

### Usage

Same as standard, just use the matrix loader:

```html
<script src="pubsub.min.js"></script>
<script src="plugin-loader-matrix.min.js"></script>
```

The matrix loader:
1. Waits for CMP ready
2. Gets current context from page
3. Fetches `manifest.json`
4. Fetches matching bundle(s)
5. Auto-loads all plugins from those bundles

No manual intervention needed - plugins load automatically after bundles are fetched.

### When to Use

| Site Size | Build |
|-----------|-------|
| < 50 plugins | `npm run build` (standard) |
| 50+ plugins | `npm run build:matrix` |
| Many section-specific plugins | `npm run build:matrix` |

# Plugin Loader

A lightweight, configurable tag management system for loading third-party scripts with targeting rules, consent management, and A/B testing.

## Installation

```bash
npm install
npm run build
```

## Build Commands

| Command | Output | Description |
|---------|--------|-------------|
| `npm run build` | `dist/plugin-loader.min.js` | Production bundle with auto-init |
| `npm run build:dev` | `dist/plugin-loader.js` | Development bundle with sourcemaps |
| `npm run build:pubsub` | `dist/pubsub.min.js` | Standalone PubSub (inline on page) |
| `npm run build:lib` | `dist/plugin-loader.lib.min.js` | Library-only (no auto-init) |
| `npm run build:esm` | `dist/plugin-loader.esm.min.js` | ES Module format |
| `npm run build:matrix` | `dist/matrix/*` | Optimized per-section bundles |

---

## Matrix Build (Optimized)

For sites with dozens of plugins/third-parties, the matrix build generates separate bundles per dimension targeting. The loader fetches only the bundles relevant to the current page.

### How It Works

1. **Build time**: Analyzes plugins and groups by configured dimensions
2. **Output**: Generates `global.min.js` + dimension-specific bundles
3. **Runtime**: Loader fetches manifest, evaluates page context, loads only matching bundles

### Configuration

Edit `config/matrix.js`:

```javascript
export default {
  // Dimension(s) to create bundles for
  // String: "section" → sport.js, news.js
  // Array: ["section", "pagetype"] → sport-article.js, sport-index.js
  bundleBy: ["section"],

  // true: Each bundle is standalone (includes global plugins)
  // false: Must load global.js + section bundle together
  selfContained: true
};
```

### Build

```bash
npm run build:matrix
```

**Output (single dimension):**
```
dist/
  plugin-loader-matrix.min.js   # Lightweight loader
  matrix/
    manifest.json      # Maps dimensions to bundles
    global.min.js      # Plugins with section: ['all']
    sport.min.js       # Plugins targeting sport
    news.min.js        # Plugins targeting news
```

**Output (multi-dimensional: `["section", "pagetype"]`):**
```
dist/
  matrix/
    global.min.js
    sport-article.min.js
    sport-index.min.js
    news-article.min.js
    news-index.min.js
```

### Usage

```html
<script src="pubsub.min.js"></script>
<script src="plugin-loader-matrix.min.js"></script>
```

The matrix loader:
1. Waits for CMP ready (if configured)
2. Gets current context from page
3. Fetches `manifest.json`
4. Loads matching bundle(s)
5. Executes the plugins

### When to Use

| Scenario | Use |
|----------|-----|
| < 50 plugins | Standard build (`npm run build`) |
| 50+ plugins | Matrix build (`npm run build:matrix`) |
| Many section-specific plugins | Matrix build |
| Simple global plugins | Standard build |

---

## PluginLoader

### Description
Core class that loads and manages third-party JavaScript plugins with targeting, consent, and lifecycle callbacks.

### Functions

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `load(config)` | Plugin config object | `Promise<Result>` | Load a plugin with targeting evaluation |
| `getContext()` | - | `Object` | Get current values from all dimension functions |
| `getMetrics()` | - | `Object` | Get performance metrics for all plugins |
| `getPlugin(name)` | `string` | `Object` | Get plugin by name |
| `setExperiments(manager)` | `ExperimentManager` | - | Connect experiment system |
| `processConsentQueue()` | - | - | Process plugins waiting for consent |
| `log(msg, data, force)` | `string`, `any`, `boolean` | - | Log message (console output when debug enabled) |

### Usage

```javascript
import PluginLoader from './src/index.js';

const loader = new PluginLoader({
  debugParam: 'pluginDebug',     // URL param to enable logging (?pluginDebug)
  eventPrefix: 'plugin',          // Prefix for PubSub events
  consentCheck: (states) => {    // Consent verification function
    return myCMP.hasConsent(states);
  },
  dimensions: {                  // Override generated dimensions
    customDim: () => document.body.dataset.custom
  },
  dimensionConfig: {             // Override match types
    customDim: { matchType: 'includes' }
  }
});
```

### Plugin Configuration

```javascript
loader.load({
  name: 'analytics',              // Required: unique identifier
  url: 'https://cdn.example.com/script.js',  // Required: script URL
  active: true,                   // Enable/disable plugin
  type: 'js',                     // Plugin type
  location: 'head',               // 'head' or 'body'
  async: true,                    // Async loading
  timeout: 3000,                  // Timeout in ms
  domains: ['all'],               // Allowed domains or ['all']
  consentState: ['analytics'],    // Required consent states or ['all']
  attributes: [['data-id', '123']],  // Custom script attributes

  include: {
    section: ['sport', 'news'],   // Include on these values
    pagetype: ['all'],            // 'all' matches any value
    special: () => isLoggedIn()   // Custom function (true = force include)
  },
  exclude: {
    section: ['puzzles'],         // Exclude from these values
    special: () => isBot()        // Custom function (true = force exclude)
  },

  preloadFn: () => {},            // Called before loading
  onloadFn: () => {},             // Called on success
  onerrorFn: (err) => {},         // Called on error
  timeoutFn: () => {},            // Called on timeout
  ignoreFn: (reason) => {}        // Called when targeting doesn't match
});
```

### Load Result

```javascript
const result = await loader.load(config);
// {
//   status: 'loaded' | 'error' | 'timeout' | 'ignore' | 'inactive',
//   name: 'analytics',
//   reason: 'Excluded by section: puzzles',  // If ignored
//   performance: { requested: 1234, received: 1567, latency: 333 }
// }
```

---

## PubSub

### Description
Lightweight publish/subscribe event system for decoupled communication. Tracks published topics for late subscribers.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `instanceId` | `string` | UUID v4 unique to this PubSub instance |

### Functions

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `subscribe({topic, func, runIfAlreadyPublished})` | Object | `string` | Subscribe to topic, returns unsubscribe token |
| `unsubscribe({topic, token})` | Object | `boolean` | Unsubscribe using token |
| `publish({topic, data})` | Object | - | Publish to topic with optional data |
| `hasPublished(topic)` | `string` | `boolean` | Check if topic was ever published |
| `clear()` | - | - | Clear all subscriptions and history |

### Usage

```javascript
import { PubSub } from './src/index.js';

const pubsub = new PubSub();

// Subscribe
const token = pubsub.subscribe({
  topic: 'cmp.ready',
  func: (data) => console.log('CMP ready', data),
  runIfAlreadyPublished: true  // Execute immediately if already published
});

// Publish
pubsub.publish({ topic: 'cmp.ready', data: { consent: true } });

// Check if published
if (pubsub.hasPublished('cmp.ready')) { ... }

// Unsubscribe
pubsub.unsubscribe({ topic: 'cmp.ready', token });
```

### PluginLoader Events

Events are published with prefix `{eventPrefix}.{pluginName}.{event}`:

| Event | Data | Description |
|-------|------|-------------|
| `plugin.{name}.load` | `{name, event}` | Plugin loaded successfully |
| `plugin.{name}.error` | `{name, event}` | Load error |
| `plugin.{name}.timeout` | `{name, event}` | Timeout reached |
| `plugin.{name}.ignore` | `{name, event, reason}` | Targeting didn't match |
| `plugin.{name}.inactive` | `{name, event}` | Plugin not active |
| `plugin.{name}.complete` | `{name, event}` | Final event (always fires) |

---

## ExperimentManager

### Description
A/B testing system that modifies plugin configurations before loading. Pageviews are bucketed into testgroups 0-99 for consistent experiences.

### Functions

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `register(experiment)` | Experiment config | `boolean` | Register an experiment |
| `unregister(id)` | `string` | - | Remove experiment |
| `apply(pluginName, pluginConfig)` | `string`, `Object` | - | Apply matching experiments to plugin |
| `isInExperiment(id)` | `string` | `boolean` | Check if user is in test range |
| `getStatus()` | - | `Object` | Get `{testgroup, applied, eligible}` |
| `getTargetingIds()` | - | `string[]` | Get IDs with `_a`/`_e` suffixes for ad targeting |

### Usage

```javascript
import { ExperimentManager } from './src/index.js';

const experiments = new ExperimentManager({
  testgroup: 42,                  // Pageviews bucket 0-99 (auto-generated if omitted)
  getContext: () => loader.getContext(),
  dimensionConfig: loader.dimensionConfig
});

experiments.register({
  id: 'new_analytics_test',
  active: true,
  testRange: [0, 24],             // 25% of Pageviews (buckets 0-24)
  plugin: 'analytics',            // Target specific plugin
  include: {
    section: ['sport', 'news'],   // Only run on these pages
    pagetype: ['all']
  },
  exclude: {
    section: ['puzzles']
  },
  apply: (pluginConfig) => {
    // Modify plugin before targeting evaluation
    pluginConfig.url = 'https://cdn.example.com/analytics-v2.js';
    pluginConfig.include.section = ['news'];  // Narrow targeting
  }
});

// Connect to loader
loader.setExperiments(experiments);

// After loading, check status
const status = experiments.getStatus();
// { testgroup: 42, applied: ['new_analytics_test'], eligible: [] }
```

### Test Range Examples

| Range | Percentage |
|-------|------------|
| `[0, 9]` | 10% |
| `[0, 24]` | 25% |
| `[0, 49]` | 50% |
| `[0, 99]` | 100% |
| `[50, 99]` | 50% (different pageviews than [0, 49]) |

---

## Targeting

### Description
Configurable include/exclude evaluation engine with support for exact, startsWith, and includes matching.

### Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `evaluateTargeting(include, exclude, context, dimensionConfig)` | Objects | `{matched, reason}` | Evaluate all targeting rules |
| `matchesRule(value, rules, matchType)` | `any`, `array`, `string` | `boolean` | Check if value matches rules |
| `isExcluded(value, rules, matchType)` | `any`, `array`, `string` | `boolean` | Check if value is excluded |
| `matchesDomain(domains, currentDomain)` | `array`, `string` | `boolean` | Check domain matching |

### Evaluation Order

1. `exclude.special()` returns `true` → **BLOCKED**
2. `include.special()` returns `true` → **ALLOWED**
3. For each dimension: exclude matches → **BLOCKED**
4. For each dimension: include specified but doesn't match → **BLOCKED**
5. All checks pass → **ALLOWED**

### Match Types

| Type | Description | Example |
|------|-------------|---------|
| `exact` | Exact match (case-insensitive) | `'sport'` matches `'sport'` |
| `startsWith` | Value starts with rule | `'sport.football'` matches `'sport'` |
| `includes` | Value contains rule | `'uk-sport-news'` matches `'sport'` |

---

## Configuration Files

### config/loader.js

Site-specific loader settings:

```javascript
export default {
  globalName: 'pluginLoader',    // window.pluginLoader
  debugParam: 'pluginDebug',     // ?pluginDebug enables logging
  readyTopic: 'cmp.ready',      // Wait for this PubSub topic (null = immediate)
  pubsubGlobal: 'PubSub'        // Global PubSub instance name
};
```

### config/matrix.js

Matrix build settings:

```javascript
export default {
  // Dimension(s) to create bundles for
  // String: "section" → sport.js, news.js
  // Array: ["section", "pagetype"] → sport-article.js, sport-index.js
  bundleBy: ["section"],

  // true: Each bundle is standalone (includes global plugins)
  // false: Must load global.js + section bundle together
  selfContained: true
};
```

### config/plugins.js

Plugin definitions:

```javascript
export default {
  myPlugin: {
    name: 'myPlugin',
    active: true,
    url: 'https://cdn.example.com/script.js',
    domains: ['all'],
    include: { section: ['all'] },
    exclude: {}
  }
};
```

### config/experiments.js

Experiment definitions:

```javascript
export default [
  {
    id: 'experiment_id',
    active: true,
    testRange: [0, 24],
    plugin: 'pluginName',
    include: { section: ['sport'] },
    apply: (config) => { config.include.section = ['news']; }
  }
];
```

### config/dimensions.json

Dimension sources (generates `src/generated/dimensions.js` at build time):

```json
{
  "url": {
    "source": "window",
    "path": "location.pathname",
    "matchType": "startsWith"
  },
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

**Supported sources:**
- `meta` - Meta tag content (`key`: meta name)
- `window` - Window object path (`path`: dot-notation)
- `cookie` - Cookie value (`key`: cookie name)
- `localStorage` / `sessionStorage` - Storage value (`key`: storage key)
- `queryParam` - URL parameter (`key`: param name)
- `dataAttribute` - Data attribute (`selector`, `key`)

---

## URL Parameter Overrides

For testing, override targeting via URL:

| Parameter | Example | Effect |
|-----------|---------|--------|
| `?pluginEnable=name` | `?pluginEnable=analytics` | Force enable plugin |
| `?pluginDisable=name` | `?pluginDisable=tracking` | Force disable plugin |
| `?pluginDisable=all&pluginEnable=dfp` | - | Disable all except dfp |

---

## Consent Integration

```javascript
const loader = new PluginLoader({
  consentCheck: (requiredStates) => {
    // Return true if consent granted for required states
    return window.CMP?.hasConsent(requiredStates) ?? false;
  }
});

// Plugins with consentState: ['analytics'] will queue until consent
// When consent granted, call:
loader.processConsentQueue();
```

---

## Ready Topic (CMP Integration)

To wait for a CMP or other initialization before loading plugins:

1. Inline PubSub early on page (auto-creates `window.PubSub` instance):
```html
<script src="pubsub.min.js"></script>
```

2. Configure in `config/loader.js`:
```javascript
export default {
  readyTopic: 'cmp.ready',
  pubsubGlobal: 'PubSub'
};
```

3. CMP publishes when ready:
```javascript
window.PubSub.publish({ topic: 'cmp.ready' });
```

---

## File Structure

```
plugin-loader/
├── config/
│   ├── loader.js          # Site configuration
│   ├── matrix.js          # Matrix build settings
│   ├── plugins.js         # Plugin definitions
│   ├── experiments.js     # A/B test definitions
│   └── dimensions.json    # Dimension sources (generates code)
├── src/
│   ├── index.js           # PluginLoader class
│   ├── entry.js           # Auto-init entry point (standard)
│   ├── entry-matrix.js    # Auto-init entry point (matrix)
│   ├── pubsub.js          # PubSub class (auto-creates window.PubSub)
│   ├── targeting.js       # Targeting evaluation
│   ├── experiments.js     # ExperimentManager class
│   ├── timer.js           # Performance timing
│   └── generated/
│       ├── dimensions.js  # Generated dimension functions
│       └── matrix/        # Generated section bundles (matrix build)
├── scripts/
│   ├── build.js           # Standard build script
│   └── build-matrix.js    # Matrix build script
└── dist/
    ├── plugin-loader.min.js       # Standard bundle
    ├── plugin-loader-matrix.min.js # Matrix loader
    ├── pubsub.min.js
    └── matrix/            # Section-specific bundles
        ├── manifest.json
        ├── global.min.js
        └── {section}.min.js
```

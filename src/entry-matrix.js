/**
 * Matrix Entry Point - Lightweight loader that fetches only relevant plugin bundles
 *
 * Flow:
 * 1. Wait for CMP ready (or load immediately if no readyTopic)
 * 2. Evaluate page context (section)
 * 3. Fetch manifest to determine which bundles to load
 * 4. Load global bundle + section-specific bundle
 * 5. Execute matching plugins
 */

import PluginLoader, { ExperimentManager, PubSub } from './index.js';
import experiments from '../config/experiments.js';
import CONFIG from '../config/loader.js';

// Matrix-specific config
const MATRIX_CONFIG = {
  manifestPath: 'matrix/manifest.json',  // Relative to script location
  basePath: ''  // Set at runtime based on script src
};

// Use existing global PubSub or create one - order independent
window[CONFIG.pubsubGlobal] = window[CONFIG.pubsubGlobal] || new PubSub();
const pubsub = window[CONFIG.pubsubGlobal];

// Create loader instance (no plugins bundled)
const loader = new PluginLoader({
  debugParam: CONFIG.debugParam,
  pubsub: pubsub,
  consentCheck: (requiredStates) => {
    return true; // Default: assume consent
  }
});

// Create experiment manager
const experimentManager = new ExperimentManager({
  getContext: () => loader.getContext(),
  dimensionConfig: loader.dimensionConfig
});

// Register experiments
experiments.forEach(exp => {
  experimentManager.register(exp);
  loader.log(`Registered experiment: ${exp.id}`, { active: exp.active, testRange: exp.testRange });
});

loader.setExperiments(experimentManager);

/**
 * Detect base path from current script src
 */
function getBasePath() {
  if (MATRIX_CONFIG.basePath) return MATRIX_CONFIG.basePath;

  const scripts = document.getElementsByTagName('script');
  for (let i = scripts.length - 1; i >= 0; i--) {
    const src = scripts[i].src;
    if (src && src.includes('plugin-loader-matrix')) {
      // Extract directory path
      const path = src.substring(0, src.lastIndexOf('/') + 1);
      MATRIX_CONFIG.basePath = path;
      return path;
    }
  }

  // Fallback to current path
  return './';
}

/**
 * Fetch and parse JSON
 */
async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

/**
 * Load a script bundle
 */
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve(window.MatrixBundle?.default || {});
    script.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(script);
  });
}

/**
 * Determine which bundles to load based on current context
 */
function getBundlesToLoad(manifest, context) {
  const bundles = [];

  for (const [name, bundle] of Object.entries(manifest.bundles)) {
    // Always load global bundle
    if (bundle.alwaysLoad) {
      bundles.push({ name, ...bundle });
      continue;
    }

    // Check section matching
    if (bundle.match?.section) {
      const currentSection = context.section || '';
      const rootSection = currentSection.split('/')[0].split('.')[0].toLowerCase();

      for (const section of bundle.match.section) {
        if (rootSection === section.toLowerCase() || currentSection.toLowerCase().startsWith(section.toLowerCase())) {
          bundles.push({ name, ...bundle });
          break;
        }
      }
    }
  }

  return bundles;
}

/**
 * Main initialization
 */
async function loadPlugins() {
  const basePath = getBasePath();
  loader.log(`Matrix loader base path: ${basePath}`);

  try {
    // Fetch manifest
    const manifestUrl = basePath + MATRIX_CONFIG.manifestPath;
    loader.log(`Fetching manifest: ${manifestUrl}`);
    const manifest = await fetchJSON(manifestUrl);

    // Get current context
    const context = loader.getContext();
    loader.log(`Current context:`, context);

    // Determine which bundles to load
    const bundlesToLoad = getBundlesToLoad(manifest, context);
    loader.log(`Bundles to load: ${bundlesToLoad.map(b => b.name).join(', ')}`);

    // Load each bundle and collect plugins
    let allPlugins = {};

    for (const bundle of bundlesToLoad) {
      const bundleUrl = basePath + manifest.basePath + bundle.path;
      loader.log(`Loading bundle: ${bundle.name} (${bundle.plugins.length} plugins)`);

      try {
        const bundlePlugins = await loadScript(bundleUrl);
        allPlugins = { ...allPlugins, ...bundlePlugins };
      } catch (err) {
        loader.log(`Failed to load bundle ${bundle.name}:`, err.message);
      }
    }

    // Load all plugins from bundles
    const pluginCount = Object.keys(allPlugins).length;
    loader.log(`Initializing with ${pluginCount} plugins from ${bundlesToLoad.length} bundles`);
    loader.log(`User testgroup: ${experimentManager.testgroup}`);

    for (const pluginConfig of Object.values(allPlugins)) {
      loader.load(pluginConfig).then(result => {
        loader.log(`${result.name}: ${result.status}`, result.reason || null);
      });
    }

    // Log experiment status
    setTimeout(() => {
      const expStatus = experimentManager.getStatus();
      loader.log('Experiment status', expStatus);
    }, 100);

  } catch (err) {
    loader.log(`Matrix loader error:`, err.message, true);
  }
}

/**
 * Wait for ready topic or load immediately
 */
function init() {
  if (CONFIG.readyTopic) {
    if (window.PubSub.hasPublished(CONFIG.readyTopic)) {
      loader.log(`${CONFIG.readyTopic} already published, loading plugins`);
      loadPlugins();
    } else {
      loader.log(`Waiting for ${CONFIG.readyTopic}`);
      window.PubSub.subscribe({
        topic: CONFIG.readyTopic,
        func: () => {
          loader.log(`${CONFIG.readyTopic} received, loading plugins`);
          loadPlugins();
        },
        runIfAlreadyPublished: true
      });
    }
  } else {
    loadPlugins();
  }
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Expose globally
window[CONFIG.globalName] = loader;

export default loader;

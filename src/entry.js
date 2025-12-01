/**
 * Entry point - Auto-initializes the plugin loader with configured plugins
 */

import PluginLoader, { ExperimentManager, PubSub } from './index.js';
import plugins from '../config/plugins.js';
import experiments from '../config/experiments.js';
import CONFIG from '../config/loader.js';

// Ensure global PubSub exists (order independent)
window[CONFIG.pubsubGlobal] = window[CONFIG.pubsubGlobal] || new PubSub();

// Create loader instance
const loader = new PluginLoader({
  debugParam: CONFIG.debugParam,
  consentCheck: (requiredStates) => {
    // Example: check against a CMP
    // return window.CMP?.hasConsent(requiredStates) ?? false;
    return true; // Default: assume consent
  }
});

// Create experiment manager with same context and config as loader
const experimentManager = new ExperimentManager({
  getContext: () => loader.getContext(),
  dimensionConfig: loader.dimensionConfig
});

// Register experiments from config
experiments.forEach(exp => {
  experimentManager.register(exp);
  loader.log(`Registered experiment: ${exp.id}`, { active: exp.active, testRange: exp.testRange });
});

// Connect experiments to loader
loader.setExperiments(experimentManager);

// Register all plugins immediately (visible with status: 'init')
Object.values(plugins).forEach(pluginConfig => {
  loader.register(pluginConfig);
});
loader.log(`Registered ${Object.keys(plugins).length} plugins`);

// Load all configured plugins
function loadPlugins() {
  loader.log(`Initializing with ${Object.keys(plugins).length} plugins`);
  loader.log(`User testgroup: ${experimentManager.testgroup}`);

  Object.values(plugins).forEach(pluginConfig => {
    loader.load(pluginConfig).then(result => {
      loader.log(`${result.name}: ${result.status}`, result.reason || null);
    });
  });

  // Log experiment status after all plugins loaded
  setTimeout(() => {
    const expStatus = experimentManager.getStatus();
    loader.log('Experiment status', expStatus);
  }, 100);
}

// Wait for ready topic or load immediately
function init() {
  if (CONFIG.readyTopic) {
    // Check if already published
    if (window.PubSub.hasPublished(CONFIG.readyTopic)) {
      loader.log(`${CONFIG.readyTopic} already published, loading plugins`);
      loadPlugins();
    } else {
      // Wait for ready topic
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
    // No ready topic configured - load immediately
    loadPlugins();
  }
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Expose globally with configurable name
window[CONFIG.globalName] = loader;

export default loader;

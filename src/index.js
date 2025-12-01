/**
 * Plugin Loader
 * Lightweight configurable tag management system
 */

import { timer, createPerformanceTracker, calculateLatency } from './timer.js';
import { evaluateTargeting, matchesDomain, normalizeTargetingConfig } from './targeting.js';
import { dimensions as generatedDimensions, dimensionConfig as generatedDimensionConfig } from './generated/dimensions.js';

/**
 * PluginLoader - Main class for loading and managing third-party scripts
 */
export class PluginLoader {
  /**
   * @param {Object} config
   * @param {Object} [config.dimensions] - Override/extend generated dimension functions
   * @param {string} [config.eventPrefix='plugin'] - Prefix for pub/sub events
   * @param {Function} [config.consentCheck] - Function to check consent state
   * @param {Object} [config.dimensionConfig] - Override/extend generated match type config
   * @param {string} [config.debugParam='pluginDebug'] - URL param to enable console logging
   */
  constructor(config = {}) {
    // Merge generated dimensions with any overrides
    this.dimensions = { ...generatedDimensions, ...config.dimensions };
    this.eventPrefix = config.eventPrefix || 'plugin';
    this.consentCheck = config.consentCheck || (() => true);
    // Merge generated dimensionConfig with any overrides
    this.dimensionConfig = { ...generatedDimensionConfig, ...config.dimensionConfig };
    this.experiments = null;

    // Logging
    this.debugParam = config.debugParam || 'pluginDebug';
    this.logs = [];

    // Storage for loaded plugins and metrics
    this.plugins = {};
    this.metrics = {};
    this.consentQueue = [];
  }

  /**
   * Check if debug mode is enabled via URL param
   * @returns {boolean}
   */
  isDebugEnabled() {
    if (typeof window === 'undefined') return false;
    return window.location.href.indexOf(this.debugParam) >= 0;
  }

  /**
   * Log a message - always stored, only output to console in debug mode
   * @param {string} msg - Log message
   * @param {*} [data=null] - Optional data to log
   * @param {boolean} [forceConsole=false] - Force output to console regardless of debug mode
   */
  log(msg = '', data = null, forceConsole = false) {
    const ts = timer();
    const entry = [ts, msg, data];
    this.logs.push(entry);

    if (this.isDebugEnabled() || forceConsole) {
      if (data !== null) {
        console.info(`[${ts}]`, msg, data);
      } else {
        console.info(`[${ts}]`, msg);
      }
    }
  }

  /**
   * Set experiment manager (optional)
   * @param {Object} experimentManager - ExperimentManager instance
   */
  setExperiments(experimentManager) {
    this.experiments = experimentManager;
  }

  /**
   * Get current context from dimension functions
   * @returns {Object} Current values for all dimensions
   */
  getContext() {
    const context = {};
    for (const [key, fn] of Object.entries(this.dimensions)) {
      try {
        context[key] = typeof fn === 'function' ? fn() : fn;
      } catch (e) {
        this.log(`Dimension "${key}" threw error`, e);
        context[key] = undefined;
      }
    }
    return context;
  }

  /**
   * Parse URL parameters for plugin enable/disable overrides
   * @returns {Object} { enable: string[], disable: string[] }
   */
  getUrlOverrides() {
    if (typeof window === 'undefined') {
      return { enable: [], disable: [] };
    }

    const params = new URLSearchParams(window.location.search);
    const enable = (params.get('pluginEnable') || '').split(',').filter(Boolean);
    const disable = (params.get('pluginDisable') || '').split(',').filter(Boolean);

    return { enable, disable };
  }

  /**
   * Check if plugin should be force-enabled/disabled via URL
   * @param {string} name - Plugin name
   * @returns {Object} { override: boolean, enabled: boolean }
   */
  checkUrlOverride(name) {
    const { enable, disable } = this.getUrlOverrides();

    // Disable all except enabled
    if (disable.includes('all')) {
      if (enable.includes(name)) {
        return { override: true, enabled: true };
      }
      return { override: true, enabled: false };
    }

    // Explicit enable
    if (enable.includes(name)) {
      return { override: true, enabled: true };
    }

    // Explicit disable
    if (disable.includes(name)) {
      return { override: true, enabled: false };
    }

    return { override: false, enabled: true };
  }

  /**
   * Check consent state
   * @param {Array} requiredStates - Required consent states
   * @returns {boolean}
   */
  checkConsent(requiredStates) {
    if (!requiredStates || requiredStates.length === 0 || requiredStates.includes('all')) {
      return true;
    }
    return this.consentCheck(requiredStates);
  }

  /**
   * Load a plugin
   * @param {Object} config - Plugin configuration
   * @returns {Promise<Object>} Result with status and performance data
   */
  load(config) {
    return new Promise((resolve) => {
      // Use existing registered plugin or create new
      const plugin = this.plugins[config.name] || this.normalizePluginConfig(config);
      this.plugins[plugin.name] = plugin;

      // Check URL override
      const urlOverride = this.checkUrlOverride(plugin.name);
      if (urlOverride.override) {
        if (urlOverride.enabled) {
          // Force enable - bypass all targeting
          plugin.include = {};
          plugin.exclude = {};
          plugin.domains = ['all'];
          plugin.consentState = ['all'];
          this.publishEvent(plugin.name, 'override.enabled');
        } else {
          // Force disable
          plugin.active = false;
          this.publishEvent(plugin.name, 'override.disabled');
        }
      }

      // Check if active
      if (plugin.active !== true) {
        this.handleInactive(plugin, resolve);
        return;
      }

      // Check consent
      if (!this.checkConsent(plugin.consentState)) {
        // Queue for later when consent granted
        this.consentQueue.push({ plugin, resolve });
        this.publishEvent(plugin.name, 'consent.pending');
        return;
      }

      // Check domain
      if (!matchesDomain(plugin.domains)) {
        this.handleIgnore(plugin, 'Domain mismatch', resolve);
        return;
      }

      // Apply experiments BEFORE targeting (so they can modify include/exclude)
      if (this.experiments) {
        this.experiments.apply(plugin.name, plugin);
      }

      // Evaluate targeting (after experiments may have modified it)
      const context = this.getContext();
      const targeting = normalizeTargetingConfig({ include: plugin.include, exclude: plugin.exclude });
      const result = evaluateTargeting(
        targeting.include,
        targeting.exclude,
        context,
        this.dimensionConfig
      );

      if (!result.matched) {
        this.handleIgnore(plugin, result.reason, resolve);
        return;
      }

      // All checks passed - load the plugin
      this.executeLoad(plugin, resolve);
    });
  }

  /**
   * Normalize plugin configuration with defaults
   * @param {Object} config - Raw config
   * @returns {Object} Normalized config
   */
  normalizePluginConfig(config) {
    return {
      name: config.name,
      id: config.id || config.name,
      url: config.url,
      type: config.type || 'js',
      active: config.active !== false,
      async: config.async !== false,
      location: (config.location || 'body').toLowerCase(),
      timeout: config.timeout || 3000,
      domains: config.domains || ['all'],
      consentState: config.consentState || config.consent || ['all'],
      include: config.include || {},
      exclude: config.exclude || {},
      attributes: config.attributes || [],
      preloadFn: config.preloadFn || config.preload || (() => {}),
      onloadFn: config.onloadFn || config.onload || (() => {}),
      onerrorFn: config.onerrorFn || config.onerror || (() => {}),
      timeoutFn: config.timeoutFn || config.ontimeout || (() => {}),
      ignoreFn: config.ignoreFn || config.onignore || (() => {}),
      performance: createPerformanceTracker(),
      eventTitle: `${this.eventPrefix}.${config.name}`,
      tag: null,
      timeoutProc: null,
      status: config.status || 'init'
    };
  }

  /**
   * Register a plugin without loading it
   * Stores plugin config with status 'init' for visibility before consent/loading
   * @param {Object} config - Plugin configuration
   * @returns {Object} Normalized plugin config
   */
  register(config) {
    const plugin = this.normalizePluginConfig(config);
    this.plugins[plugin.name] = plugin;
    return plugin;
  }

  /**
   * Execute the actual script load
   * @param {Object} plugin - Normalized plugin config
   * @param {Function} resolve - Promise resolver
   */
  executeLoad(plugin, resolve) {
    // Set up timeout
    plugin.timeoutProc = setTimeout(() => {
      if (plugin.status === 'requested') {
        plugin.status = 'timeout';
        plugin.performance.status = 'timeout';
        plugin.performance.timeout = timer();
        plugin.performance.latency = calculateLatency(plugin.performance);

        this.updateMetrics(plugin);
        plugin.timeoutFn();

        this.publishEvent(plugin.name, 'timeout');
        this.publishEvent(plugin.name, 'complete');

        resolve({
          status: 'timeout',
          name: plugin.name,
          performance: plugin.performance
        });
      }
    }, plugin.timeout);

    // Preload phase
    plugin.performance.preload = timer();
    plugin.preloadFn();

    // Create script tag
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.id = plugin.id;
    script.async = plugin.async;

    // Apply custom attributes
    for (const [key, value] of plugin.attributes) {
      script.setAttribute(key, value);
    }

    // Handle load success
    script.onload = () => {
      if (plugin.status === 'requested') {
        clearTimeout(plugin.timeoutProc);

        plugin.status = 'loaded';
        plugin.performance.status = 'loaded';
        plugin.performance.received = timer();
        plugin.performance.latency = calculateLatency(plugin.performance);

        this.updateMetrics(plugin);
        plugin.onloadFn();

        this.publishEvent(plugin.name, 'load');
        this.publishEvent(plugin.name, 'complete');

        resolve({
          status: 'loaded',
          name: plugin.name,
          performance: plugin.performance
        });
      }
    };

    // Handle load error
    script.onerror = (err) => {
      if (plugin.status === 'requested') {
        clearTimeout(plugin.timeoutProc);

        plugin.status = 'error';
        plugin.performance.status = 'error';
        plugin.performance.error = timer();
        plugin.performance.latency = calculateLatency(plugin.performance);

        this.updateMetrics(plugin);
        plugin.onerrorFn(err);

        this.publishEvent(plugin.name, 'error');
        this.publishEvent(plugin.name, 'complete');

        resolve({
          status: 'error',
          name: plugin.name,
          error: err,
          performance: plugin.performance
        });
      }
    };

    // Store reference and load
    plugin.tag = script;

    if (plugin.url) {
      script.src = plugin.url;
      plugin.status = 'requested';
      plugin.performance.status = 'requested';
      plugin.performance.requested = timer();

      const target = document.getElementsByTagName(plugin.location)[0] || document.body;
      target.appendChild(script);
    } else {
      this.handleIgnore(plugin, 'No URL provided', resolve);
    }
  }

  /**
   * Handle inactive plugin
   */
  handleInactive(plugin, resolve) {
    plugin.status = 'inactive';
    plugin.performance.status = 'inactive';
    plugin.performance.latency = calculateLatency(plugin.performance);

    this.updateMetrics(plugin);
    this.publishEvent(plugin.name, 'inactive');
    this.publishEvent(plugin.name, 'complete');

    resolve({
      status: 'inactive',
      name: plugin.name,
      performance: plugin.performance
    });
  }

  /**
   * Handle ignored plugin (targeting didn't match)
   */
  handleIgnore(plugin, reason, resolve) {
    plugin.active = false;
    plugin.status = 'ignore';
    plugin.performance.status = 'ignore';
    plugin.performance.latency = calculateLatency(plugin.performance);

    this.updateMetrics(plugin);
    plugin.ignoreFn(reason);

    this.publishEvent(plugin.name, 'ignore', { reason });
    this.publishEvent(plugin.name, 'complete');

    resolve({
      status: 'ignore',
      name: plugin.name,
      reason: reason,
      performance: plugin.performance
    });
  }

  /**
   * Process queued plugins waiting for consent
   */
  processConsentQueue() {
    const queue = [...this.consentQueue];
    this.consentQueue = [];

    for (const { plugin, resolve } of queue) {
      if (this.checkConsent(plugin.consentState)) {
        // Re-evaluate and load
        const context = this.getContext();
        const targeting = normalizeTargetingConfig({ include: plugin.include, exclude: plugin.exclude });
        const result = evaluateTargeting(
          targeting.include,
          targeting.exclude,
          context,
          this.dimensionConfig
        );

        if (result.matched && matchesDomain(plugin.domains)) {
          this.executeLoad(plugin, resolve);
        } else {
          this.handleIgnore(plugin, result.reason || 'Domain mismatch', resolve);
        }
      } else {
        // Still no consent, re-queue
        this.consentQueue.push({ plugin, resolve });
      }
    }
  }

  /**
   * Update metrics storage
   */
  updateMetrics(plugin) {
    this.metrics[plugin.name] = { ...plugin.performance };
  }

  /**
   * Publish pub/sub event
   */
  publishEvent(name, event, data = {}) {
    window.PubSub.publish({
      topic: `${this.eventPrefix}.${name}.${event}`,
      data: { name, event, ...data }
    });
  }

  /**
   * Get all metrics
   * @returns {Object} Metrics for all plugins
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Get specific plugin
   * @param {string} name - Plugin name
   * @returns {Object|undefined}
   */
  getPlugin(name) {
    return this.plugins[name];
  }
}

// Re-export modules for standalone use
export { PubSub } from './pubsub.js';
export { timer, createPerformanceTracker } from './timer.js';
export { evaluateTargeting, matchesDomain, matchesRule, isExcluded } from './targeting.js';
export { ExperimentManager } from './experiments.js';

// Default export
export default PluginLoader;

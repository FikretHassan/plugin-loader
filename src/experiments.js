/**
 * ExperimentManager - A/B Testing system for plugin loading
 *
 * Allows running experiments that modify plugin configurations
 * before they load, with user bucketing for consistent experiences.
 */

import { evaluateTargeting, normalizeTargetingConfig } from './targeting.js';

/**
 * ExperimentManager - Manages A/B test experiments
 */
export class ExperimentManager {
  /**
   * @param {Object} config
   * @param {number} [config.testgroup] - User's test bucket (0-99). Auto-generated if not provided.
   * @param {boolean} [config.active=true] - Whether experiments are enabled
   * @param {Function} [config.getContext] - Function to get current page context for targeting
   */
  constructor(config = {}) {
    this.active = config.active !== false;
    this.testgroup = config.testgroup ?? Math.floor(Math.random() * 100);
    this.getContext = config.getContext || (() => ({}));
    this.dimensionConfig = config.dimensionConfig || {};

    this.registry = {};
    this.applied = [];   // Experiments that were applied (test group)
    this.eligible = [];  // Experiments eligible but not applied (control group)
  }

  /**
   * Register an experiment
   * @param {Object} experiment
   * @param {string} experiment.id - Unique experiment ID
   * @param {boolean} [experiment.active=true] - Whether experiment is active
   * @param {number[]} experiment.testRange - [min, max] inclusive range for testgroup (0-99)
   * @param {string} [experiment.plugin] - Target specific plugin name, or omit for global
   * @param {Object} [experiment.include] - Targeting include rules
   * @param {Object} [experiment.exclude] - Targeting exclude rules
   * @param {Function} experiment.apply - Function to apply experiment modifications
   */
  register(experiment) {
    if (!experiment.id) {
      console.warn('Experiment must have an id');
      return false;
    }

    this.registry[experiment.id] = {
      id: experiment.id,
      active: experiment.active !== false,
      testRange: experiment.testRange || [0, 99],
      plugin: experiment.plugin || null,
      include: experiment.include || {},
      exclude: experiment.exclude || {},
      apply: experiment.apply || (() => {})
    };

    return true;
  }

  /**
   * Unregister an experiment
   * @param {string} id - Experiment ID
   */
  unregister(id) {
    delete this.registry[id];
  }

  /**
   * Check if user is in experiment's test range
   * @param {string} id - Experiment ID
   * @returns {boolean}
   */
  isInExperiment(id) {
    if (!this.active) return false;

    const exp = this.registry[id];
    if (!exp?.active) return false;

    const [min, max] = exp.testRange;
    return this.testgroup >= min && this.testgroup <= max;
  }

  /**
   * Check if experiment targeting matches current context
   * @param {Object} exp - Experiment config
   * @returns {boolean}
   */
  targetingMatches(exp) {
    // No targeting = matches all
    if (!exp.include && !exp.exclude) return true;

    const context = this.getContext();
    const targeting = normalizeTargetingConfig({
      include: exp.include,
      exclude: exp.exclude
    });

    const result = evaluateTargeting(
      targeting.include,
      targeting.exclude,
      context,
      this.dimensionConfig
    );

    return result.matched;
  }

  /**
   * Apply experiments for a specific plugin (or global if no pluginName)
   * @param {string} [pluginName] - Plugin name, or omit for global experiments
   * @param {Object} [pluginConfig] - Plugin config to potentially modify
   */
  apply(pluginName, pluginConfig) {
    if (!this.active) return;

    for (const [id, exp] of Object.entries(this.registry)) {
      // Match: plugin-specific or global
      const isMatch = pluginName
        ? exp.plugin === pluginName
        : !exp.plugin;

      if (exp.active && isMatch) {
        // Check targeting
        if (this.targetingMatches(exp)) {
          // Check testgroup
          if (this.isInExperiment(id)) {
            // In test group - apply experiment
            try {
              exp.apply(pluginConfig);
              this.applied.push(id);
            } catch (e) {
              console.warn(`Experiment "${id}" apply() threw error:`, e);
            }
          } else {
            // Not in test group - track as eligible (control)
            this.eligible.push(id);
          }
        }
      }
    }
  }

  /**
   * Get experiment status for reporting
   * @returns {Object} { testgroup, applied, eligible }
   */
  getStatus() {
    return {
      testgroup: this.testgroup,
      applied: [...this.applied],
      eligible: [...this.eligible]
    };
  }

  /**
   * Get formatted IDs for ad targeting
   * Returns applied with '_a' suffix, eligible with '_e' suffix
   * @returns {string[]}
   */
  getTargetingIds() {
    const ids = [];
    for (const id of this.applied) {
      ids.push(`${id}_a`);
    }
    for (const id of this.eligible) {
      ids.push(`${id}_e`);
    }
    return ids;
  }

  /**
   * Reset applied/eligible tracking
   */
  reset() {
    this.applied = [];
    this.eligible = [];
  }

  /**
   * Clear all experiments
   */
  clear() {
    this.registry = {};
    this.reset();
  }
}

export default ExperimentManager;

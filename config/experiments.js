/**
 * Experiment Definitions
 *
 * Each experiment:
 * - id: Unique identifier
 * - active: Enable/disable
 * - testRange: [min, max] user buckets 0-99 (e.g., [0, 24] = 25% of users)
 * - plugin: Target specific plugin, or null for global experiments
 * - include/exclude: Targeting rules (same as plugins)
 * - apply: Function to modify plugin config before loading
 */

export default [

  // Example: Test new analytics endpoint for 25% of users
  {
    id: 'analytics_v2_test',
    active: true,  // Set to true to enable
    testRange: [0, 24],
    plugin: 'analytics',
    include: {
      section: ['all'],
      pagetype: ['all'],
      geo: ['all']
    },
    exclude: {},
    apply: function(pluginConfig) {
      pluginConfig.url = 'https://cdn.example.com/analytics-v2.min.js';
      window.pluginLoader?.log('[Experiment] analytics_v2_test applied');
    }
  },

  // Example: Disable sports widget on football pages for 50% of users
  {
    id: 'sports_widget_football_holdout',
    active: false,
    testRange: [0, 49],
    plugin: 'sportsWidget',
    include: {
      section: ['football'],
      pagetype: ['all'],
      geo: ['all']
    },
    exclude: {},
    apply: function(pluginConfig) {
      pluginConfig.active = false;
      window.pluginLoader?.log('[Experiment] sports_widget_football_holdout applied');
    }
  }

];

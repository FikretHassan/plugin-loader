/**
 * Loader Configuration
 * Site-specific settings for the plugin loader
 */

export default {
  // Window object name (e.g., window.pluginLoader)
  globalName: 'pluginLoader',

  // URL param to enable console logging (e.g., ?pluginDebug)
  debugParam: 'pluginDebug',

  // PubSub topic to wait for before loading plugins
  // Set to null to load immediately without waiting
  readyTopic: 'cmp.ready',

  // Name of global PubSub instance (for sites using inline pubsub.min.js)
  pubsubGlobal: 'PubSub'
};

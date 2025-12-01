/**
 * Plugin Definitions
 * Example plugins demonstrating various targeting configurations
 */

export default {

  // Example: Loads on all pages
  analytics: {
    name: 'analytics',
    active: true,
    url: 'https://cdn.jsdelivr.net/npm/js-cookie@3.0.5/dist/js.cookie.min.js',
    domains: ['all'],
    include: {
      section: ['all'],
      pagetype: ['all'],
      geo: ['all']
    },
    exclude: {}
  },

  // Example: Section-restricted plugin
  sportsWidget: {
    name: 'sportsWidget',
    active: true,
    url: 'https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js',
    domains: ['all'],
    include: {
      section: ['sport', 'football', 'cricket'],
      pagetype: ['all'],
      geo: ['all']
    },
    exclude: {
      section: ['sport/betting']
    }
  },

  // Example: Geo-restricted plugin
  ukTracker: {
    name: 'ukTracker',
    active: true,
    url: 'https://cdn.jsdelivr.net/npm/uuid@9.0.0/dist/umd/uuid.min.js',
    domains: ['all'],
    consentState: ['analytics'],
    include: {
      section: ['all'],
      pagetype: ['all'],
      geo: ['gb']
    },
    exclude: {}
  },

  // Example: Custom exclusion logic
  premiumFeature: {
    name: 'premiumFeature',
    active: true,
    url: 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
    domains: ['all'],
    include: {
      section: ['all'],
      pagetype: ['all'],
      geo: ['all']
    },
    exclude: {
      special: function() {
        // Exclude bots
        return /bot|crawler|spider/i.test(navigator.userAgent);
      }
    }
  }

};

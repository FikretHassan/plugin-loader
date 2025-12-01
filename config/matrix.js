/**
 * Matrix Build Configuration
 *
 * Controls how plugins are grouped into optimized bundles.
 */

export default {
  /**
   * bundleBy - Dimension(s) to create separate bundles for
   *
   * String: Creates bundles per value of that dimension
   *   "section" → global.js, sport.js, news.js, etc.
   *
   * Array: Creates bundles for combinations (matrix)
   *   ["section", "pagetype"] → sport-article.js, sport-index.js, news-article.js, etc.
   */
  bundleBy: ["section"],

  /**
   * selfContained - Include global plugins in every bundle
   *
   * true:  Each bundle contains ALL plugins that match (standalone)
   *        sport.js includes global + sport-specific plugins
   *
   * false: Section bundles only contain section-specific plugins
   *        Requires loading global.js + section.js together
   */
  selfContained: true
};

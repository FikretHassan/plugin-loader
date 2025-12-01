/**
 * Targeting - Configurable include/exclude evaluation engine
 */

/**
 * Check if a value matches against a rule array
 * @param {*} value - Current value to check
 * @param {Array} rules - Array of allowed values, or ['all'] to match any
 * @param {string} [matchType='exact'] - 'exact', 'startsWith', or 'includes'
 * @returns {boolean} True if value matches rules
 */
export function matchesRule(value, rules, matchType = 'exact') {
  if (!rules || rules.length === 0) {
    return true; // No rules = allow all
  }

  if (rules.indexOf('all') === 0 || rules.includes('all')) {
    return true;
  }

  const normalizedValue = String(value).toLowerCase();

  switch (matchType) {
    case 'startsWith':
      return rules.some(rule => normalizedValue.startsWith(String(rule).toLowerCase()));
    case 'includes':
      return rules.some(rule => normalizedValue.includes(String(rule).toLowerCase()));
    case 'exact':
    default:
      return rules.some(rule => normalizedValue === String(rule).toLowerCase());
  }
}

/**
 * Check if a value is excluded by rule array
 * @param {*} value - Current value to check
 * @param {Array} rules - Array of excluded values
 * @param {string} [matchType='exact'] - 'exact', 'startsWith', or 'includes'
 * @returns {boolean} True if value is EXCLUDED (blocked)
 */
export function isExcluded(value, rules, matchType = 'exact') {
  if (!rules || rules.length === 0) {
    return false; // No exclusion rules = not excluded
  }

  const normalizedValue = String(value).toLowerCase();

  switch (matchType) {
    case 'startsWith':
      return rules.some(rule => normalizedValue.startsWith(String(rule).toLowerCase()));
    case 'includes':
      return rules.some(rule => normalizedValue.includes(String(rule).toLowerCase()));
    case 'exact':
    default:
      return rules.some(rule => normalizedValue === String(rule).toLowerCase());
  }
}

/**
 * Evaluate targeting rules against current context
 *
 * @param {Object} include - Include rules object
 * @param {Object} exclude - Exclude rules object
 * @param {Object} context - Current page context values
 * @param {Object} [dimensionConfig={}] - Configuration for how each dimension should be matched
 * @returns {Object} { matched: boolean, reason: string }
 *
 * @example
 * const result = evaluateTargeting(
 *   { zone: ['sport', 'news'], pagetype: ['all'] },
 *   { zone: ['puzzles'] },
 *   { zone: 'sport', pagetype: 'article', geo: 'gb' },
 *   { zone: { matchType: 'startsWith' } }  // zone uses startsWith matching
 * );
 */
export function evaluateTargeting(include = {}, exclude = {}, context = {}, dimensionConfig = {}) {
  // 1. Check exclude.special() first - custom exclusion function
  if (typeof exclude.special === 'function') {
    try {
      if (exclude.special() === true) {
        return { matched: false, reason: 'Excluded by special function' };
      }
    } catch (e) {
      console.warn('exclude.special() threw error:', e);
    }
  }

  // 2. Check include.special() - custom inclusion function (overrides other rules)
  if (typeof include.special === 'function') {
    try {
      if (include.special() === true) {
        return { matched: true, reason: 'Included by special function' };
      }
    } catch (e) {
      console.warn('include.special() threw error:', e);
    }
  }

  // 3. Evaluate each dimension in context
  for (const dimension of Object.keys(context)) {
    const currentValue = context[dimension];
    const config = dimensionConfig[dimension] || {};
    const matchType = config.matchType || 'exact';

    // Check exclusion first
    if (exclude[dimension] && exclude[dimension].length > 0) {
      if (isExcluded(currentValue, exclude[dimension], matchType)) {
        return { matched: false, reason: `Excluded by ${dimension}: ${currentValue}` };
      }
    }

    // Check inclusion
    if (include[dimension] && include[dimension].length > 0) {
      if (!matchesRule(currentValue, include[dimension], matchType)) {
        return { matched: false, reason: `Not included by ${dimension}: ${currentValue}` };
      }
    }
  }

  // 4. All checks passed
  return { matched: true, reason: 'All targeting rules passed' };
}

/**
 * Check if current domain matches allowed domains
 * @param {Array} domains - Array of allowed domains, or ['all']
 * @param {string} [currentDomain] - Current domain (defaults to window.location.host)
 * @returns {boolean}
 */
export function matchesDomain(domains, currentDomain) {
  if (!domains || domains.length === 0) {
    return true;
  }

  const host = currentDomain || (typeof window !== 'undefined' ? window.location.host : '');

  if (domains.includes('all')) {
    return true;
  }

  return domains.includes(host);
}

/**
 * Normalize targeting config with defaults
 * @param {Object} config - Raw targeting config
 * @returns {Object} Normalized config with include/exclude objects
 */
export function normalizeTargetingConfig(config = {}) {
  return {
    include: {
      special: config.include?.special || (() => false),
      ...config.include
    },
    exclude: {
      special: config.exclude?.special || (() => false),
      ...config.exclude
    }
  };
}

export default {
  matchesRule,
  isExcluded,
  evaluateTargeting,
  matchesDomain,
  normalizeTargetingConfig
};

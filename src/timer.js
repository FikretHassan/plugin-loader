/**
 * Timer - High-precision timestamp utility with fallback chain
 *
 * Attempts to use the best available timing API:
 * 1. window.RUM.now() - Real User Monitoring API
 * 2. window.performance.now() - Browser Performance API
 * 3. Date.now() - Fallback
 */

/**
 * Get current timestamp in milliseconds since page load
 * @returns {number} Milliseconds as integer
 */
export function timer() {
  let timestamp;

  // Try RUM API first (Real User Monitoring)
  if (typeof window !== 'undefined' && typeof window.RUM !== 'undefined' && typeof window.RUM.now === 'function') {
    timestamp = window.RUM.now();
  }
  // Try Performance API
  else if (typeof window !== 'undefined' && typeof window.performance !== 'undefined' && typeof window.performance.now === 'function') {
    timestamp = window.performance.now();
  }
  // Fallback to Date.now()
  else {
    timestamp = Date.now();
  }

  return Math.round(timestamp);
}

/**
 * Create a performance tracker for a plugin
 * @returns {Object} Performance tracking object
 */
export function createPerformanceTracker() {
  return {
    status: 'init',
    init: timer(),
    requested: 0,
    received: 0,
    preload: 0,
    error: -1,
    timeout: -1,
    latency: 0
  };
}

/**
 * Calculate latency from init to current time
 * @param {Object} perf - Performance tracker object
 * @returns {number} Latency in milliseconds
 */
export function calculateLatency(perf) {
  return timer() - perf.init;
}

export default timer;

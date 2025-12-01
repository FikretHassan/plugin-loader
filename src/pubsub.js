/**
 * PubSub - Lightweight publish/subscribe event system
 */
export class PubSub {
  constructor() {
    this.instanceId = this.generateInstanceId();
    this.topics = [];
    this.publishedTopics = [];
    this.uid = -1;
  }

  /**
   * Generate a unique instance ID (UUID v4)
   * @returns {string}
   */
  generateInstanceId() {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
      );
    }
    // Fallback for environments without crypto
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /**
   * Subscribe to a topic
   * @param {Object} config
   * @param {string} config.topic - Topic name to subscribe to
   * @param {Function} config.func - Callback function
   * @param {boolean} [config.runIfAlreadyPublished=false] - Execute immediately if topic was already published
   * @returns {string|false} Token for unsubscribing, or false if invalid
   */
  subscribe({ topic, func, runIfAlreadyPublished = false }) {
    if (typeof func !== 'function') {
      return false;
    }

    // If topic was already published and runIfAlreadyPublished is true, execute immediately
    if (runIfAlreadyPublished) {
      for (let i = 0; i < this.publishedTopics.length; i++) {
        if (this.publishedTopics[i] === topic) {
          func.call();
          break;
        }
      }
    }

    const token = (this.uid += 1).toString();
    this.topics.push({ token, topic, func });
    return token;
  }

  /**
   * Unsubscribe from a topic
   * @param {Object} config
   * @param {string} config.topic - Topic name
   * @param {string} config.token - Token returned from subscribe
   */
  unsubscribe({ topic, token }) {
    for (let i = 0; i < this.topics.length; i++) {
      if (this.topics[i].token === token && this.topics[i].topic === topic) {
        this.topics.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Publish to a topic
   * @param {Object} config
   * @param {string} config.topic - Topic name to publish
   * @param {*} [config.data] - Optional data to pass to subscribers
   */
  publish({ topic, data }) {
    this.publishedTopics.push(topic);

    for (let i = 0; i < this.topics.length; i++) {
      if (this.topics[i].topic === topic) {
        this.topics[i].func.call(null, data);
      }
    }
  }

  /**
   * Check if a topic has been published
   * @param {string} topic - Topic name
   * @returns {boolean}
   */
  hasPublished(topic) {
    return this.publishedTopics.includes(topic);
  }

  /**
   * Clear all subscriptions and published history
   */
  clear() {
    this.topics = [];
    this.publishedTopics = [];
    this.uid = -1;
  }
}

// Auto-create global instance (order-independent)
if (typeof window !== 'undefined') {
  window.PubSub = window.PubSub || new PubSub();
}

export default PubSub;

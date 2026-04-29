/**
 * JavaScript class with methods for testing js-adapter.
 */

/**
 * User manager class.
 */
class UserManager {
  constructor(dbConnection) {
    this.db = dbConnection;
    this.users = new Map();
  }

  /**
   * Add a user.
   */
  addUser(id, userData) {
    this.users.set(id, userData);
    return { id, ...userData };
  }

  /**
   * Get user by ID.
   */
  getUser(id) {
    return this.users.get(id);
  }

  /**
   * Async method to fetch users.
   */
  async fetchUsers() {
    // Simulate async operation
    return Array.from(this.users.entries()).map(([id, data]) => ({ id, ...data }));
  }

  /**
   * Delete user.
   */
  deleteUser(id) {
    return this.users.delete(id);
  }

  /**
   * Check if user exists.
   */
  hasUser(id) {
    return this.users.has(id);
  }
}

/**
 * Logger class with static methods.
 */
class Logger {
  static instance = null;

  constructor(logLevel) {
    this.level = logLevel;
    this.logs = [];
  }

  /**
   * Get singleton instance.
   */
  static getInstance(level = 'info') {
    if (!Logger.instance) {
      Logger.instance = new Logger(level);
    }
    return Logger.instance;
  }

  /**
   * Log a message.
   */
  log(message, level = 'info') {
    if (this.shouldLog(level)) {
      this.logs.push({ timestamp: new Date().toISOString(), level, message });
      console.log(`[${level}] ${message}`);
    }
  }

  /**
   * Check if should log at this level.
   */
  shouldLog(level) {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  /**
   * Get all logs.
   */
  getLogs() {
    return this.logs;
  }

  /**
   * Clear logs.
   */
  clear() {
    this.logs = [];
  }
}

/**
 * Async processor class.
 */
class AsyncProcessor {
  constructor(config) {
    this.config = config;
    this.queue = [];
    this.processing = false;
  }

  /**
   * Add item to queue.
   */
  enqueue(item) {
    this.queue.push(item);
  }

  /**
   * Process queue asynchronously.
   */
  async processQueue(handler) {
    if (this.processing) {
      return false;
    }
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        await handler(item);
      }
      return true;
    } finally {
      this.processing = false;
    }
  }

  /**
   * Get queue length.
   */
  getQueueLength() {
    return this.queue.length;
  }

  /**
   * Async method with timeout.
   */
  async processWithTimeout(item, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout'));
      }, timeoutMs);

      // Simulate processing
      setTimeout(() => {
        clearTimeout(timer);
        resolve({ processed: item });
      }, 100);
    });
  }
}

module.exports = {
  UserManager,
  Logger,
  AsyncProcessor
};
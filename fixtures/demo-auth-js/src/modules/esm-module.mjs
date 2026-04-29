/**
 * ESM module file for testing ES module syntax.
 */

// ESM imports
import express from 'express';
import { Router } from 'express';

// Named exports
export const API_VERSION = '2.0.0';
export const MAX_ITEMS = 100;

/**
 * ESM exported function.
 */
export function createRouter() {
  const router = new Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', version: API_VERSION });
  });

  router.get('/items', (req, res) => {
    res.json({ items: [], max: MAX_ITEMS });
  });

  return router;
}

/**
 * ESM exported async function.
 */
export async function fetchData(url) {
  const response = await fetch(url);
  return response.json();
}

/**
 * ESM exported arrow function.
 */
export const calculateTotal = (items) => {
  return items.reduce((sum, item) => sum + item.price, 0);
};

/**
 * ESM exported class.
 */
export class ESMService {
  constructor(config) {
    this.config = config;
  }

  getConfig() {
    return this.config;
  }

  async initialize() {
    await new Promise(resolve => setTimeout(resolve, 100));
    return true;
  }
}

/**
 * ESM exported generator.
 */
export function* itemGenerator(items) {
  for (const item of items) {
    yield item;
  }
}

// Re-export from another module (simulated)
export { Router as ExpressRouter };

// Default export
export default {
  API_VERSION,
  MAX_ITEMS,
  createRouter,
  fetchData,
  calculateTotal,
  ESMService,
  itemGenerator
};
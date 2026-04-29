// Level 3 - deepest nested file
export const level3 = {
  name: 'level3',
  depth: 3,
  children: []
};

// Re-export from root to test circular reference handling
export { root } from '../../index.js';
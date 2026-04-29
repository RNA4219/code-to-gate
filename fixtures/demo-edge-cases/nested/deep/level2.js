// Level 2 nested file
import { level3 } from './structure/level3.js';

export const level2 = {
  name: 'level2',
  depth: 2,
  children: [level3]
};
// Level 1 nested file
import { level2 } from './deep/level2.js';

export const level1 = {
  name: 'level1',
  depth: 1,
  children: [level2]
};
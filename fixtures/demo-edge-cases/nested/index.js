// Root level file in nested structure
import { level1 } from './nested/level1.js';

export const root = {
  name: 'root',
  children: [level1]
};
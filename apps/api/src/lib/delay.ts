import { randomInt } from 'node:crypto';

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Random integer in the inclusive range [min, max]. */
export const randomBetween = (min: number, max: number): number => randomInt(min, max + 1);


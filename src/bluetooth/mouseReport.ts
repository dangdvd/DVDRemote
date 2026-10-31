/** A HID mouse report moves at most 127 counts per axis. */
const MAX = 127;

/**
 * Turns fractional finger deltas into whole HID counts. Remainders carry over, so slow drags still
 * move the cursor, and large moves are split into several reports.
 */
export class MouseAccumulator {
  private x = 0;
  private y = 0;

  reset(): void {
    this.x = 0;
    this.y = 0;
  }

  take(dx: number, dy: number): [number, number][] {
    this.x += dx;
    this.y += dy;
    let ix = Math.trunc(this.x);
    let iy = Math.trunc(this.y);
    this.x -= ix;
    this.y -= iy;
    const out: [number, number][] = [];
    while (ix !== 0 || iy !== 0) {
      const sx = Math.max(-MAX, Math.min(MAX, ix));
      const sy = Math.max(-MAX, Math.min(MAX, iy));
      out.push([sx, sy]);
      ix -= sx;
      iy -= sy;
    }
    return out;
  }
}

export const MouseButton = { LEFT: 1, RIGHT: 2, MIDDLE: 4 } as const;

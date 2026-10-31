export type SwipeDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

/** Movement before a gesture picks its axis, so a tap's jitter never moves the selection. */
const AXIS_LOCK_PX = 12;

/**
 * Turns finger movement into arrow key presses, for TVs without a mouse cursor (Android TV).
 * Each `step` pixels along the gesture's axis emits one press, so a long swipe walks through a
 * list. The axis is locked per gesture to ignore diagonal drift, and switches when the finger
 * clearly turns.
 */
export class SwipeTracker {
  private x = 0;
  private y = 0;
  private axis: 'x' | 'y' | null = null;

  constructor(private readonly step = 40) {}

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.axis = null;
  }

  move(dx: number, dy: number): SwipeDirection[] {
    this.x += dx;
    this.y += dy;
    if (!this.axis) {
      if (Math.hypot(this.x, this.y) < AXIS_LOCK_PX) return [];
      this.axis = Math.abs(this.x) >= Math.abs(this.y) ? 'x' : 'y';
    }
    if (this.axis === 'x' && Math.abs(this.y) >= this.step && Math.abs(this.y) > Math.abs(this.x)) this.axis = 'y';
    else if (this.axis === 'y' && Math.abs(this.x) >= this.step && Math.abs(this.x) > Math.abs(this.y)) this.axis = 'x';

    const out: SwipeDirection[] = [];
    if (this.axis === 'x') {
      while (Math.abs(this.x) >= this.step) {
        out.push(this.x > 0 ? 'RIGHT' : 'LEFT');
        this.x -= Math.sign(this.x) * this.step;
        this.y = 0; // drift on the other axis does not carry over
      }
    } else {
      while (Math.abs(this.y) >= this.step) {
        out.push(this.y > 0 ? 'DOWN' : 'UP');
        this.y -= Math.sign(this.y) * this.step;
        this.x = 0;
      }
    }
    return out;
  }
}

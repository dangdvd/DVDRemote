import { SwipeTracker } from '../src/ui/swipe';

describe('SwipeTracker', () => {
  it('ignores tap jitter', () => {
    const t = new SwipeTracker(40);
    expect([...t.move(3, -2), ...t.move(-4, 5)]).toEqual([]);
  });

  it('emits one press per step along the swipe', () => {
    const t = new SwipeTracker(40);
    const out = [...t.move(0, 30), ...t.move(0, 30), ...t.move(0, 45)];
    expect(out).toEqual(['DOWN', 'DOWN']);
  });

  it('ignores diagonal drift on a horizontal swipe', () => {
    const t = new SwipeTracker(40);
    const out = [];
    for (let i = 0; i < 10; i++) out.push(...t.move(-12, 3));
    expect(out).toEqual(['LEFT', 'LEFT', 'LEFT']);
  });

  it('switches axis when the finger turns', () => {
    const t = new SwipeTracker(40);
    const out = [...t.move(45, 0), ...t.move(0, -50)];
    expect(out).toEqual(['RIGHT', 'UP']);
  });

  it('starts fresh after reset', () => {
    const t = new SwipeTracker(40);
    t.move(30, 0);
    t.reset();
    expect(t.move(15, 0)).toEqual([]);
  });
});

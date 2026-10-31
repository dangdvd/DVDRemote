import { MouseAccumulator } from '../src/bluetooth/mouseReport';

describe('MouseAccumulator', () => {
  it('carries fractions so slow drags still move', () => {
    const m = new MouseAccumulator();
    expect(m.take(0.4, -0.4)).toEqual([]);
    expect(m.take(0.4, -0.4)).toEqual([]);
    expect(m.take(0.4, -0.4)).toEqual([[1, -1]]);
  });

  it('splits large moves into reports of at most 127', () => {
    const m = new MouseAccumulator();
    expect(m.take(300, -10)).toEqual([
      [127, -10],
      [127, 0],
      [46, 0],
    ]);
  });

  it('forgets leftovers on reset', () => {
    const m = new MouseAccumulator();
    m.take(0.9, 0);
    m.reset();
    expect(m.take(0.5, 0)).toEqual([]);
  });
});

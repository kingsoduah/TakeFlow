// Monotone cubic path through points (no overshoot), from the design.
export function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const dx: number[] = [];
  const dy: number[] = [];
  const ms: number[] = [];
  const t: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    dy[i] = pts[i + 1][1] - pts[i][1];
    ms[i] = dx[i] === 0 ? 0 : dy[i] / dx[i];
  }
  t[0] = ms[0];
  t[n - 1] = ms[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = ms[i - 1] * ms[i] <= 0 ? 0 : (ms[i - 1] + ms[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (ms[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / ms[i];
    const b = t[i + 1] / ms[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * ms[i];
      t[i + 1] = k * b * ms[i];
    }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h3 = dx[i] / 3;
    d += `C${(pts[i][0] + h3).toFixed(1)},${(pts[i][1] + t[i] * h3).toFixed(1)} ${(pts[i + 1][0] - h3).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h3).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

export function cumulative(values: number[]): number[] {
  let s = 0;
  return values.map((v) => (s += v));
}

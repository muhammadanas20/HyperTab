/** Row-major homogeneous matrices; column vectors, parent × local.
 * Canvas uses the same affine transform but a different argument order.
 */
import type { Pt } from "./anatomy";
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const translate = (x: number, y: number): Mat3 => [
  1,
  0,
  x,
  0,
  1,
  y,
  0,
  0,
  1,
];
export const scale = (x: number, y = x): Mat3 => [x, 0, 0, 0, y, 0, 0, 0, 1];
export const rotate = (r: number): Mat3 => {
  const c = Math.cos(r),
    s = Math.sin(r);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
export function multiply(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3],
    a[0] * b[1] + a[1] * b[4],
    a[0] * b[2] + a[1] * b[5] + a[2],
    a[3] * b[0] + a[4] * b[3],
    a[3] * b[1] + a[4] * b[4],
    a[3] * b[2] + a[4] * b[5] + a[5],
    0,
    0,
    1,
  ];
}
export const compose = (...ms: Mat3[]): Mat3 => ms.reduce(multiply, IDENTITY);
export const transform = (m: Mat3, p: Pt): Pt => [
  m[0] * p[0] + m[1] * p[1] + m[2],
  m[3] * p[0] + m[4] * p[1] + m[5],
];
export function inverse(m: Mat3): Mat3 {
  const d = m[0] * m[4] - m[1] * m[3];
  if (Math.abs(d) < 1e-12) throw new RangeError("Singular rig transform");
  return [
    m[4] / d,
    -m[1] / d,
    (m[1] * m[5] - m[4] * m[2]) / d,
    -m[3] / d,
    m[0] / d,
    (m[3] * m[2] - m[0] * m[5]) / d,
    0,
    0,
    1,
  ];
}
export function apply(ctx: CanvasRenderingContext2D, m: Mat3): void {
  ctx.transform(m[0], m[3], m[1], m[4], m[2], m[5]);
}

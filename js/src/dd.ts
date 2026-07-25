/**
 * Implements extended-precision floating-point numbers
 * which maintain 106 bits (approximately 30 decimal digits) of precision.
 *
 * Only the subset reachable from {@link orientationIndexDouble} is ported; see
 * `portedMembers` for `upstream/jts/math/DD.java` in `upstream/jts/pin.json`.
 *
 * Every method body below is a literal transcription of the vendored Java. The
 * operation order is the algorithm: Dekker's splitting constant and Knuth's
 * two-sum rely on IEEE 754 binary64 round-to-nearest-even and on `a * b + c`
 * never contracting into a fused multiply-add, which JavaScript never does. Do
 * not reorder, factor out subexpressions, or introduce `Math.fma`-like helpers.
 *
 * @jts DD
 */
export class DD {
  /**
   * The value to split a double-precision value on during multiplication
   * @jts DD#SPLIT
   */
  private static readonly SPLIT = 134217729.0; // 2^27+1, for IEEE double

  /** The high-order component of the double-double precision value. */
  private hi = 0.0;

  /** The low-order component of the double-double precision value. */
  private lo = 0.0;

  /**
   * Converts the <tt>double</tt> argument to a DoubleDouble number.
   *
   * @param x a numeric value
   * @return the extended precision version of the value
   * @jts DD#valueOf(double)
   */
  static valueOfDouble(x: number): DD {
    return new DD(x);
  }

  /**
   * Creates a new DoubleDouble with value x.
   *
   * @param x the value to initialize
   * @jts DD#DD(double)
   */
  constructor(x: number) {
    this.initDouble(x);
  }

  /** @jts DD#init(double) */
  private initDouble(x: number): void {
    this.hi = x;
    this.lo = 0.0;
  }

  /** @jts DD#init(double,double) */
  private initDoubleDouble(hi: number, lo: number): void {
    this.hi = hi;
    this.lo = lo;
  }

  /**
   * Adds the argument to the value of <tt>this</tt>.
   * To prevent altering constants,
   * this method <b>must only</b> be used on values known to
   * be newly created.
   *
   * @param y the value to add
   * @return this object, increased by y
   * @jts DD#selfAdd(double)
   */
  selfAddDouble(y: number): DD {
    // Java declares `double H, h, S, s, e, f;` up front; each is declared here at
    // its first assignment instead, which `prefer-const` requires and which
    // leaves the statement sequence and the arithmetic untouched.
    const S = this.hi + y;
    const e = S - this.hi;
    let s = S - e;
    s = y - e + (this.hi - s);
    const f = s + this.lo;
    const H = S + f;
    const h = f + (S - H);
    this.hi = H + h;
    this.lo = h + (H - this.hi);
    return this;
  }

  /** @jts DD#selfAdd(double,double) */
  private selfAddDoubleDouble(yhi: number, ylo: number): DD {
    const S = this.hi + yhi;
    const T = this.lo + ylo;
    let e = S - this.hi;
    const f = T - this.lo;
    let s = S - e;
    let t = T - f;
    s = yhi - e + (this.hi - s);
    t = ylo - f + (this.lo - t);
    e = s + T;
    const H = S + e;
    const h = e + (S - H);
    e = t + h;
    const zhi = H + e;
    const zlo = e + (H - zhi);
    this.initDoubleDouble(zhi, zlo);
    return this;
  }

  /**
   * Subtracts the argument from the value of <tt>this</tt>.
   * To prevent altering constants,
   * this method <b>must only</b> be used on values known to
   * be newly created.
   *
   * @param y the value to subtract
   * @return this object, decreased by y
   * @jts DD#selfSubtract(DD)
   * @jts-deviate Java guards with `if (isNaN()) return this;` before delegating.
   *   `isNaN()` is outside the ported subset, and the guard cannot change any
   *   observable result here: within this subset a NaN `hi` always comes with a
   *   NaN `lo` (`init` zeroes `lo`, and every `selfAdd`/`selfMultiply` step
   *   propagates NaN into both components), so both paths leave `signum()`
   *   returning 0 — which is also what Java's `signum()` documents for NaN.
   */
  selfSubtractDD(y: DD): DD {
    return this.selfAddDoubleDouble(-y.hi, -y.lo);
  }

  /**
   * Multiplies this object by the argument, returning <tt>this</tt>.
   * To prevent altering constants,
   * this method <b>must only</b> be used on values known to
   * be newly created.
   *
   * @param y the value to multiply by
   * @return this object, multiplied by y
   * @jts DD#selfMultiply(DD)
   */
  selfMultiplyDD(y: DD): DD {
    return this.selfMultiplyDoubleDouble(y.hi, y.lo);
  }

  /** @jts DD#selfMultiply(double,double) */
  private selfMultiplyDoubleDouble(yhi: number, ylo: number): DD {
    let C = DD.SPLIT * this.hi;
    let hx = C - this.hi;
    let c = DD.SPLIT * yhi;
    hx = C - hx;
    const tx = this.hi - hx;
    let hy = c - yhi;
    C = this.hi * yhi;
    hy = c - hy;
    const ty = yhi - hy;
    // Java parenthesises this as ((((hx*hy-C)+hx*ty)+tx*hy)+tx*ty)+(hi*ylo+lo*yhi).
    // `+`/`-` are left-associative in both languages, so dropping the redundant
    // groups (as Prettier does) leaves the evaluation order identical.
    c = hx * hy - C + hx * ty + tx * hy + tx * ty + (this.hi * ylo + this.lo * yhi);
    const zhi = C + c;
    hx = C - zhi;
    const zlo = c + hx;
    this.initDoubleDouble(zhi, zlo);
    return this;
  }

  /**
   * Returns an integer indicating the sign of this value.
   * <ul>
   * <li>if this value is &gt; 0, returns 1
   * <li>if this value is &lt; 0, returns -1
   * <li>if this value is = 0, returns 0
   * <li>if this value is NaN, returns 0
   * </ul>
   *
   * @return an integer indicating the sign of this value
   * @jts DD#signum()
   */
  signum(): number {
    if (this.hi > 0) return 1;
    if (this.hi < 0) return -1;
    if (this.lo > 0) return 1;
    if (this.lo < 0) return -1;
    return 0;
  }
}

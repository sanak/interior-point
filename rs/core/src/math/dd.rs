//! Implements extended-precision floating-point numbers which maintain 106 bits
//! (approximately 30 decimal digits) of precision.
//!
//! Only the subset reachable from [`crate::algorithm::cg_algorithms_dd::orientation_index_double`]
//! is ported; see `portedMembers` for `upstream/jts/main/math/DD.java` in `upstream/jts/pin.json`.
//!
//! Every method body below is a literal transcription of the vendored Java. The
//! operation order is the algorithm: Dekker's splitting constant and Knuth's
//! two-sum rely on IEEE 754 binary64 round-to-nearest-even and on `a * b + c`
//! never contracting into a fused multiply-add, which Rust only emits for an
//! explicit [`f64::mul_add`]. Do not reorder or factor out subexpressions.

/// @jts DD
#[derive(Clone, Copy, Debug)]
pub(crate) struct DD {
    /// The high-order component of the double-double precision value.
    hi: f64,
    /// The low-order component of the double-double precision value.
    lo: f64,
}

/// The value to split a double-precision value on during multiplication
///
/// @jts DD#SPLIT
const SPLIT: f64 = 134217729.0; // 2^27+1, for IEEE double

impl DD {
    /// Converts the `f64` argument to a DoubleDouble number.
    ///
    /// @jts DD#valueOf(double)
    pub(crate) fn value_of_double(x: f64) -> DD {
        DD::new_double(x)
    }

    /// Creates a new DoubleDouble with value x.
    ///
    /// @jts DD#DD(double)
    fn new_double(x: f64) -> DD {
        let mut dd = DD { hi: 0.0, lo: 0.0 };
        dd.init_double(x);
        dd
    }

    /// @jts DD#init(double)
    fn init_double(&mut self, x: f64) {
        self.hi = x;
        self.lo = 0.0;
    }

    /// @jts DD#init(double,double)
    fn init_double_double(&mut self, hi: f64, lo: f64) {
        self.hi = hi;
        self.lo = lo;
    }

    /// Adds the argument to the value of `self`.
    ///
    /// Java's `H`, `S`, `T` and `C` become `big_h`, `big_s`, `big_t` and `big_c`: the
    /// unchanged-name rule's mechanical case conversion, since rustfmt and clippy reject
    /// single uppercase locals.
    ///
    /// @jts DD#selfAdd(double)
    pub(crate) fn self_add_double(&mut self, y: f64) -> &mut DD {
        let big_s = self.hi + y;
        let e = big_s - self.hi;
        let mut s = big_s - e;
        s = (y - e) + (self.hi - s);
        let f = s + self.lo;
        let big_h = big_s + f;
        let h = f + (big_s - big_h);
        self.hi = big_h + h;
        self.lo = h + (big_h - self.hi);
        self
    }

    /// @jts DD#selfAdd(double,double)
    fn self_add_double_double(&mut self, yhi: f64, ylo: f64) -> &mut DD {
        let big_s = self.hi + yhi;
        let big_t = self.lo + ylo;
        let mut e = big_s - self.hi;
        let f = big_t - self.lo;
        let mut s = big_s - e;
        let mut t = big_t - f;
        s = (yhi - e) + (self.hi - s);
        t = (ylo - f) + (self.lo - t);
        e = s + big_t;
        let big_h = big_s + e;
        let h = e + (big_s - big_h);
        e = t + h;
        let zhi = big_h + e;
        let zlo = e + (big_h - zhi);
        self.init_double_double(zhi, zlo);
        self
    }

    /// Subtracts the argument from the value of `self`.
    ///
    /// @jts DD#selfSubtract(DD)
    /// @jts-deviate Java guards with `if (isNaN()) return this;` before delegating.
    ///   `isNaN()` is outside the ported subset, and the guard cannot change any
    ///   observable result here: within this subset a NaN `hi` always comes with a
    ///   NaN `lo` (`init` zeroes `lo`, and every `self_add`/`self_multiply` step
    ///   propagates NaN into both components), so both paths leave `signum()`
    ///   returning 0 — which is also what Java's `signum()` documents for NaN.
    pub(crate) fn self_subtract_dd(&mut self, y: DD) -> &mut DD {
        self.self_add_double_double(-y.hi, -y.lo)
    }

    /// Multiplies this object by the argument, returning `self`.
    ///
    /// @jts DD#selfMultiply(DD)
    pub(crate) fn self_multiply_dd(&mut self, y: DD) -> &mut DD {
        self.self_multiply_double_double(y.hi, y.lo)
    }

    /// @jts DD#selfMultiply(double,double)
    fn self_multiply_double_double(&mut self, yhi: f64, ylo: f64) -> &mut DD {
        let mut big_c = SPLIT * self.hi;
        let mut hx = big_c - self.hi;
        let mut c = SPLIT * yhi;
        hx = big_c - hx;
        let tx = self.hi - hx;
        let mut hy = c - yhi;
        big_c = self.hi * yhi;
        hy = c - hy;
        let ty = yhi - hy;
        c = (((hx * hy - big_c) + hx * ty) + tx * hy) + tx * ty + (self.hi * ylo + self.lo * yhi);
        let zhi = big_c + c;
        hx = big_c - zhi;
        let zlo = c + hx;
        self.init_double_double(zhi, zlo);
        self
    }

    /// Returns an integer indicating the sign of this value.
    ///
    /// - if this value is > 0, returns 1
    /// - if this value is < 0, returns -1
    /// - if this value is = 0, returns 0
    /// - if this value is NaN, returns 0
    ///
    /// @jts DD#signum()
    pub(crate) fn signum(&self) -> i32 {
        if self.hi > 0.0 {
            return 1;
        }
        if self.hi < 0.0 {
            return -1;
        }
        if self.lo > 0.0 {
            return 1;
        }
        if self.lo < 0.0 {
            return -1;
        }
        0
    }
}

#[cfg(test)]
mod tests {
    use super::DD;

    /// Reproduces CGAlgorithmsDD's unrolled 2x2 determinant.
    fn det(ax: f64, ay: f64, bx: f64, by: f64) -> i32 {
        let mut a = DD::value_of_double(ax);
        let b = DD::value_of_double(by);
        let mut c = DD::value_of_double(ay);
        let d = DD::value_of_double(bx);
        a.self_multiply_dd(b);
        c.self_multiply_dd(d);
        a.self_subtract_dd(c);
        a.signum()
    }

    #[test]
    fn represents_a_plain_double_exactly() {
        assert_eq!(DD::value_of_double(0.0).signum(), 0);
        assert_eq!(DD::value_of_double(1.5).signum(), 1);
        assert_eq!(DD::value_of_double(-1.5).signum(), -1);
    }

    #[test]
    fn keeps_the_sign_of_a_determinant_that_cancels_in_plain_f64() {
        // With e = 2^-52 every input is exactly representable and the true
        // determinant is (1+e)^2 - (1+2e) = e^2 = 2^-104: positive, but far below
        // the ulp of the products, so plain f64 rounds it away. Real JTS DD
        // reports 1 here (verified against jts-core-1.19.0.jar).
        let e = f64::powi(2.0, -52);
        let (ax, ay, bx, by) = (1.0 + e, 1.0, 1.0 + 2.0 * e, 1.0 + e);
        assert_eq!(ax * by - ay * bx, 0.0);
        assert_eq!(det(ax, ay, bx, by), 1);
    }

    #[test]
    fn treats_a_determinant_of_four_identical_values_as_collinear() {
        // At 1e17 the ulp is 16, so 1e17+1, +2 and +3 all collapse onto 1e17 and
        // the true determinant really is 0. DD must not invent a sign.
        assert_eq!(1e17 + 1.0, 1e17);
        assert_eq!(det(1e17, 1e17 + 1.0, 1e17 + 2.0, 1e17 + 3.0), 0);
    }

    #[test]
    fn adds_without_losing_the_low_order_component() {
        assert_eq!((1.0 + 1e-30) - 1.0, 0.0);
        let mut dd = DD::value_of_double(1.0);
        dd.self_add_double(1e-30);
        dd.self_subtract_dd(DD::value_of_double(1.0));
        assert_eq!(dd.signum(), 1);
    }
}

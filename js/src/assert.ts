/**
 * A utility for making programming assertions.
 *
 * @jts-adapter Assert
 */

/**
 * Thrown when an assertion fails, mirroring JTS's `AssertionFailedException`.
 *
 * @jts-adapter AssertionFailedException
 */
export class AssertionFailedError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "AssertionFailedError";
  }
}

/**
 * Throws an `AssertionFailedError` if the given assertion is not true.
 *
 * @param assertion a condition that is supposed to be true
 * @param message a description of the assertion
 * @jts-adapter Assert.isTrue(boolean,String)
 */
export function assertTrue(assertion: boolean, message?: string): void {
  if (!assertion) throw new AssertionFailedError(message);
}

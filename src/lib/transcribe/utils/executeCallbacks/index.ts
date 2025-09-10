/**
 * Utility function to execute all callbacks in an array with error handling
 * @param callbacks Array of callback functions to execute
 * @param args Arguments to pass to each callback
 */
export function executeCallbacks<T extends unknown[]>(
  callbacks: ((...args: T) => void)[],
  ...args: T
): void {
  callbacks.forEach((callback) => {
    try {
      callback(...args);
    } catch (error) {
      console.error("Error executing callback:", error);
    }
  });
}

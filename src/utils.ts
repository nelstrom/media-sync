/**
 * Simple logger utility
 */
export const Logger = {
  debug: (...args: unknown[]) => {
    if (!Logger.enableDebug) return;
    console.debug('[MediaSync]', ...args);
  },
  error: (...args: unknown[]) => {
    console.error('[MediaSync]', ...args);
  },
  enableDebug: true
};

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * 
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns The debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
  
  return function(...args: Parameters<T>) {
    // Clear previous timeout
    if (timeout !== null) {
      window.clearTimeout(timeout);
    }
    
    // Set new timeout
    timeout = window.setTimeout(() => {
      func.apply(null, args);
      timeout = null;
    }, wait);
  };
}
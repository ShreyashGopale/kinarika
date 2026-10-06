import { useState, useEffect } from 'react';

/**
 * Delays the value used for computation by `delay` ms.
 * Typing in a search box will not trigger expensive re-filtering on every keystroke.
 */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
}

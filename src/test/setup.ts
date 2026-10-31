import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

// jsdom lacks these in some environments; the components use them defensively.
if (!('matchMedia' in window)) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!('createObjectURL' in URL)) {
  Object.defineProperty(URL, 'createObjectURL', { writable: true, value: () => 'blob:mock' });
  Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: () => {} });
}

afterEach(() => {
  localStorage.clear();
});

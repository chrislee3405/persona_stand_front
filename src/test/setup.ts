import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  // A test must provide its own API responses; never contact a real backend.
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => {
    throw new Error('Unexpected fetch: provide a response in the test.');
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom's URL doesn't ship createObjectURL/revokeObjectURL; stub them.
const urlAny = URL as unknown as {
  createObjectURL?: (b: Blob) => string;
  revokeObjectURL?: (u: string) => void;
};
if (typeof urlAny.createObjectURL !== 'function') {
  urlAny.createObjectURL = () => 'blob:mock';
}
if (typeof urlAny.revokeObjectURL !== 'function') {
  urlAny.revokeObjectURL = () => {};
}

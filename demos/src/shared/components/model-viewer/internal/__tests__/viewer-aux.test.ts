import { describe, it, expect } from 'vitest';

// Note: getViewer constructs a real WebGLRenderer that jsdom can't run.
// We type-check the Viewer interface by importing the type and asserting
// `isAuxAnimating` is part of it via a structural assignment.

import type { Viewer } from '../viewer';

describe('Viewer interface', () => {
  it('exposes a nullable isAuxAnimating probe', () => {
    const stub: Pick<Viewer, 'isAuxAnimating'> = { isAuxAnimating: null };
    expect(stub.isAuxAnimating).toBeNull();
    stub.isAuxAnimating = () => true;
    expect(stub.isAuxAnimating()).toBe(true);
  });
});

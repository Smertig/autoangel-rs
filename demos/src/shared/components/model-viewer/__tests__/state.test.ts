import { describe, expect, it } from 'vitest';
import {
  decodeModelEntryState,
  decodeModelFormatState,
} from '../state';

describe('decodeModelEntryState', () => {
  it('returns undefined for non-objects', () => {
    expect(decodeModelEntryState(undefined)).toBeUndefined();
    expect(decodeModelEntryState(null)).toBeUndefined();
    expect(decodeModelEntryState('hi')).toBeUndefined();
  });

  it('keeps recognized fields, drops unknown / wrong-typed ones', () => {
    expect(
      decodeModelEntryState({
        clip: 'walk',
        paused: true,
        posInClip: 1.5,
        bogus: 'x',
      }),
    ).toEqual({ clip: 'walk', paused: true, posInClip: 1.5 });

    expect(decodeModelEntryState({ clip: 42, paused: 'yes' })).toEqual({});
  });

  it('rejects non-finite numeric positions', () => {
    expect(decodeModelEntryState({ posInClip: NaN })?.posInClip).toBeUndefined();
    expect(decodeModelEntryState({ posInClip: Infinity })?.posInClip).toBeUndefined();
  });

  it('preserves a well-formed camera', () => {
    expect(
      decodeModelEntryState({ camera: { position: [1, 2, 3], target: [4, 5, 6] } })?.camera,
    ).toEqual({ position: [1, 2, 3], target: [4, 5, 6] });
  });

  it('drops a malformed camera (wrong arity, non-numeric, NaN)', () => {
    expect(decodeModelEntryState({ camera: 'hi' })?.camera).toBeUndefined();
    expect(decodeModelEntryState({ camera: { position: [1, 2], target: [3, 4, 5] } })?.camera).toBeUndefined();
    expect(decodeModelEntryState({ camera: { position: [1, 'x', 3], target: [4, 5, 6] } })?.camera).toBeUndefined();
    expect(decodeModelEntryState({ camera: { position: [NaN, 2, 3], target: [4, 5, 6] } })?.camera).toBeUndefined();
    // partial match: missing target ⇒ whole camera dropped
    expect(decodeModelEntryState({ camera: { position: [1, 2, 3] } })?.camera).toBeUndefined();
  });
});

describe('decodeModelFormatState', () => {
  it('returns undefined for non-objects', () => {
    expect(decodeModelFormatState(undefined)).toBeUndefined();
  });

  it('preserves valid speed and loopMode', () => {
    expect(decodeModelFormatState({ speed: 2, loopMode: 'once' })).toEqual({
      speed: 2,
      loopMode: 'once',
    });
  });

  it('drops unknown loopMode values', () => {
    expect(decodeModelFormatState({ loopMode: 'sideways' })).toEqual({});
  });

  it('drops non-finite speeds', () => {
    expect(decodeModelFormatState({ speed: NaN })).toEqual({});
  });
});

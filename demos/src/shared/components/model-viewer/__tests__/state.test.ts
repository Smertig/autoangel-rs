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

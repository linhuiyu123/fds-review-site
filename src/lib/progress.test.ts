import { describe, expect, it } from 'vitest';
import { applyAttempt, emptyProgress } from './progress';

describe('progress state', () => {
  it('records a correct attempt without adding it to the wrong book', () => {
    const state = applyAttempt(emptyProgress(), 'q1', true);

    expect(state.attempts.q1.total).toBe(1);
    expect(state.attempts.q1.correct).toBe(1);
    expect(state.wrongBook.q1).toBeUndefined();
  });

  it('adds an incorrect attempt to the wrong book and keeps the latest result', () => {
    const state = applyAttempt(emptyProgress(), 'q1', false);

    expect(state.attempts.q1.total).toBe(1);
    expect(state.attempts.q1.correct).toBe(0);
    expect(state.wrongBook.q1?.reason).toBe('答错自动加入');
  });
});

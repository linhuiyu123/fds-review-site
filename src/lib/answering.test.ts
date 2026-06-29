import { describe, expect, it } from 'vitest';
import { gradeAnswer, normalizeAnswer } from './answering';

describe('answer grading', () => {
  it('normalizes whitespace, punctuation, and case for objective answers', () => {
    expect(normalizeAnswer(' a , c ')).toEqual(['A', 'C']);
    expect(normalizeAnswer(['t'])).toEqual(['T']);
  });

  it('grades single-choice and true-false answers exactly', () => {
    expect(gradeAnswer(['B'], ['B'])).toBe(true);
    expect(gradeAnswer(['F'], ['T'])).toBe(false);
  });

  it('grades multi-answer selections without depending on order', () => {
    expect(gradeAnswer(['C', 'A'], ['A', 'C'])).toBe(true);
    expect(gradeAnswer(['A'], ['A', 'C'])).toBe(false);
  });
});

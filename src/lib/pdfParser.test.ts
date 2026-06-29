import { describe, expect, it } from 'vitest';
import { parsePdfQuestions } from './pdfParser';

describe('PDF question parser', () => {
  it('extracts objective answers from PTA standard-answer text', () => {
    const text = `
判断题
1-1-1 A heap path property statement.
    T                        F
| 参考答案
  答案           F

单选题
2-1-1 Which structure is suitable?
    A. Queue     B. Stack     C. Heap     D. Graph
| 参考答案
  答案           B
`;

    const questions = parsePdfQuestions(text, {
      sourceId: 'sample',
      sourceName: 'sample paper'
    });

    expect(questions).toHaveLength(2);
    expect(questions[0].answer).toEqual(['F']);
    expect(questions[0].explanation).toContain('选 F');
    expect(questions[0].explanation).not.toMatch(/来自|PDF|题目来源/);
    expect(questions[1].options.map((option) => option.key)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('extracts fill-in answers from answer blocks', () => {
    const text = `
5-1-1 Complete blanks.
| 参考答案
  填空#1          first->next
  填空#2          second
| 评测详情
`;

    const [question] = parsePdfQuestions(text, {
      sourceId: 'sample',
      sourceName: 'sample paper'
    });

    expect(question.answer).toEqual(['first->next', 'second']);
    expect(question.explanation).toContain('填空答案');
    expect(question.explanation).not.toMatch(/来自|PDF|题目来源/);
  });
});

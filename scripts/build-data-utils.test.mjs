import { describe, expect, it } from 'vitest';
import {
  cleanPtaOptionText,
  cleanPtaPrompt,
  dedupeQuestions,
  extractReferenceCode,
  inferReferenceAnswer,
  normalizeQuestionKey
} from './build-data-utils.mjs';

describe('PTA prompt cleanup', () => {
  it('removes PTA chrome, line-number gutters, and submitted-code footer', () => {
    const prompt = `7-1 Sample Problem
分数 10
全屏浏览
切换布局
作者 陈越
单位 浙江大学

Solve the problem.

[ C++ ]
复制内容
格式
全屏
收起
1
2
int main() {
  return 0;
}

代码长度限制
16 KB
时间限制
400 ms
C (gcc)
1
2
int leaked() { return 1; }
测试用例
提交本题作答`;

    const cleaned = cleanPtaPrompt(prompt, '7-1');

    expect(cleaned).toContain('Solve the problem.');
    expect(cleaned).toContain('int main()');
    expect(cleaned).not.toMatch(/分数|全屏浏览|复制内容|代码长度限制|提交本题作答/);
    expect(cleaned).not.toContain('int leaked');
    expect(cleaned).not.toMatch(/\n1\n2\n/);
  });

  it('removes inline PDF copy toolbar text and code line numbers', () => {
    const prompt = `Question text.

[ C ] 复制内容 格式 全屏 收起

1 #include <stdio.h>
2 struct Node {
3 int value;
4 };
5 v0: -> null`;

    const cleaned = cleanPtaPrompt(prompt);

    expect(cleaned).not.toMatch(/复制内容|格式|全屏|收起|\[ C \]/);
    expect(cleaned).toContain('#include <stdio.h>');
    expect(cleaned).toContain('struct Node {');
    expect(cleaned).toContain('v0: -> null');
    expect(cleaned).not.toMatch(/\n1 #include|\n2 struct|\n5 v0/);
  });

  it('strips copied line numbers from sample input and output blocks', () => {
    const prompt = `Sample Input:

[ in ]
1 8 7
2 1 5
3 5 4

Sample Output:

[ out ]
1 1 2 7 8`;

    const cleaned = cleanPtaPrompt(prompt);

    expect(cleaned).not.toMatch(/\[ in \]|\[ out \]/);
    expect(cleaned).toContain('8 7\n1 5\n5 4');
    expect(cleaned).toContain('Sample Output:\n\n1 2 7 8');
  });

  it('cleans copied-code labels from option text', () => {
    expect(cleanPtaOptionText('复制内容\n格式\n全屏\n1\nwhile(x){x--;}')).toBe('while(x){x--;}');
  });

  it('extracts submitted code as a reference answer', () => {
    const raw = `Problem text
代码长度限制
16 KB
C (gcc)
1
2
int main() {
  return 0;
}
测试用例
查看上次提交`;

    expect(extractReferenceCode(raw)).toBe('int main() {\n  return 0;\n}');
  });
});

describe('deduplication and answer inference', () => {
  it('deduplicates by normalized prompt and keeps the answered copy', () => {
    const answered = {
      id: 'pdf-1',
      sourceKind: 'past-paper',
      prompt: 'To find a minimum spanning tree in a sparse graph, Kruskal is better.',
      options: [{ key: 'T', text: 'T' }],
      answer: ['T']
    };
    const duplicate = {
      id: 'pta-1',
      sourceKind: 'final-practice',
      prompt: 'To find a minimum spanning tree in a sparse graph, Kruskal is better.',
      options: [{ key: 'T', text: 'T' }]
    };

    expect(normalizeQuestionKey(answered)).toBe(normalizeQuestionKey(duplicate));
    expect(dedupeQuestions([duplicate, answered])).toEqual([answered]);
  });

  it('preserves images from duplicate PTA copies when the answered copy is kept', () => {
    const answered = {
      id: 'pdf-graph',
      sourceKind: 'past-paper',
      prompt: 'The maximum flow in the network of the given figure is:',
      options: [{ key: 'A', text: '10' }],
      answer: ['A'],
      images: []
    };
    const withImage = {
      id: 'pta-graph',
      sourceKind: 'final-practice',
      prompt: 'The maximum flow in the network of the given figure is:',
      options: [{ key: 'A', text: '10' }],
      images: [{ src: 'https://images.ptausercontent.com/network.png', alt: 'network' }]
    };

    expect(dedupeQuestions([withImage, answered])).toEqual([
      {
        ...answered,
        images: withImage.images
      }
    ]);
  });

  it('infers objective answers for common homework patterns', () => {
    const answer = inferReferenceAnswer({
      id: 'q',
      sourceName: 'ZJUFDS-HW1-YDS2026',
      label: '1-2',
      kind: 'true-false',
      prompt: 'The Fibonacci number sequence is defined recursively. The time complexity of the function which calculates FN recursively is Θ(N!).',
      options: [
        { key: 'T', text: 'T' },
        { key: 'F', text: 'F' }
      ],
      rawPrompt: ''
    });

    expect(answer.answer).toEqual(['F']);
    expect(answer.explanation).toContain('参考答案');
  });
});

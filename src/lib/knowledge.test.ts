import { describe, expect, it } from 'vitest';
import { explainAnswer, summarizeKnowledgePoints } from './knowledge';
import type { Question } from './types';

function question(id: string, tags: string[]): Question {
  return {
    id,
    sourceId: 's',
    sourceName: 'source',
    sourceKind: 'homework',
    typeName: '单选题',
    kind: 'single-choice',
    label: id,
    title: id,
    prompt: '',
    options: [],
    explanation: '',
    images: [],
    tags
  };
}

describe('knowledge point summaries', () => {
  it('sorts high-frequency knowledge points by question count', () => {
    const summary = summarizeKnowledgePoints([
      question('q1', ['Graph', 'Tree']),
      question('q2', ['Graph']),
      question('q3', ['Heap'])
    ]);

    expect(summary.map((item) => [item.tag, item.count])).toEqual([
      ['Graph', 2],
      ['Heap', 1],
      ['Tree', 1]
    ]);
  });

  it('adds concrete review focus for known FDS topics', () => {
    const [graph] = summarizeKnowledgePoints([question('q1', ['Graph'])]);

    expect(graph.focus).toContain('DFS');
    expect(graph.focus).toContain('最短路');
  });
});

describe('answer explanations', () => {
  it('explains the Prim and Kruskal distinction for sparse MST questions', () => {
    const explain = explainAnswer as (
      answer: string[] | undefined,
      tags: string[],
      kind: string,
      prompt: string
    ) => string;

    const explanation = explain(
      ['F'],
      ['Graph'],
      'true-false',
      "To find a minimum spanning tree in a sparse graph, Prim's algorithm is more suitable than Kruskal's."
    );

    expect(explanation).toContain('选 F');
    expect(explanation).toContain('稀疏图');
    expect(explanation).toContain('Kruskal');
    expect(explanation).toContain('按边');
    expect(explanation).toContain('Prim');
    expect(explanation).toContain('按点');
    expect(explanation).not.toMatch(/来自|PDF|题目来源/);
  });
});

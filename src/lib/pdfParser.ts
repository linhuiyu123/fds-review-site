import type { PdfQuestionMeta, Question, QuestionKind } from './types';
import { explainAnswer } from './knowledge';

const TYPE_BY_PREFIX: Record<string, { typeName: string; kind: QuestionKind }> = {
  '1': { typeName: '判断题', kind: 'true-false' },
  '2': { typeName: '单选题', kind: 'single-choice' },
  '3': { typeName: '多选题', kind: 'multiple-choice' },
  '5': { typeName: '程序填空题', kind: 'fill-blank' },
  '6': { typeName: '函数题', kind: 'function' },
  '7': { typeName: '编程题', kind: 'programming' }
};

function cleanText(value: string): string {
  return value
    .replace(/\f/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractOptions(prompt: string, kind: QuestionKind) {
  if (kind === 'true-false') {
    return [
      { key: 'T', text: 'T' },
      { key: 'F', text: 'F' }
    ];
  }

  const options = Array.from(prompt.matchAll(/(^|\s)([A-D])\.\s*([\s\S]*?)(?=\s+[A-D]\.\s|$)/g))
    .map((match) => ({ key: match[2], text: cleanText(match[3]) }))
    .filter((option) => option.text);

  return options;
}

function stripAnswer(promptWithAnswer: string): { prompt: string; answerBlock: string } {
  const [prompt, ...answerParts] = promptWithAnswer.split(/\|\s*参考答案/);
  const answerBlock = answerParts.join('| 参考答案').split(/\|\s*评测详情/)[0] ?? '';
  return { prompt: cleanText(prompt), answerBlock: cleanText(answerBlock) };
}

function extractAnswer(answerBlock: string): string[] | undefined {
  const blanks = Array.from(answerBlock.matchAll(/填空#\d+\s+([^\n]+)/g)).map((match) => cleanText(match[1]));
  if (blanks.length > 0) return blanks;

  const objective = /答案\s+([A-DTF](?:\s*[,，、]\s*[A-DTF])*)/.exec(answerBlock);
  if (objective) {
    return objective[1]
      .split(/[,，、\s]+/)
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
  }

  return undefined;
}

function stripOptionsFromPrompt(prompt: string, kind: QuestionKind): string {
  if (kind === 'true-false') {
    return cleanText(prompt.replace(/\bT\s+F\b/g, ''));
  }
  const firstOption = prompt.search(/(^|\s)A\.\s/);
  return firstOption >= 0 ? cleanText(prompt.slice(0, firstOption)) : cleanText(prompt);
}

function inferTags(prompt: string): string[] {
  const rules: Array<[RegExp, string]> = [
    [/heap|堆/i, 'Heap'],
    [/graph|图|shortest path|minimum spanning|topological|flow|Euler/i, 'Graph'],
    [/sort|排序|quicksort|merge|shell|radix/i, 'Sorting'],
    [/hash|哈希/i, 'Hashing'],
    [/binary search tree|BST|二叉搜索树/i, 'BST'],
    [/tree|树/i, 'Tree'],
    [/stack|queue|栈|队列/i, 'Stack/Queue'],
    [/disjoint|union|并查集/i, 'Disjoint Set'],
    [/complexity|O\(|Θ|Ω/i, 'Complexity']
  ];
  const tags = rules.filter(([regex]) => regex.test(prompt)).map(([, tag]) => tag);
  if (/minimum spanning tree|最小生成树/i.test(prompt)) {
    return tags.filter((tag) => tag !== 'Tree').length ? tags.filter((tag) => tag !== 'Tree') : ['Graph'];
  }
  return tags.length ? tags : ['FDS'];
}

export function parsePdfQuestions(text: string, meta: PdfQuestionMeta): Question[] {
  const normalized = cleanText(text);
  const questionPattern = /(^|\n)(\d+-\d+-\d+)\s+([\s\S]*?)(?=\n\d+-\d+-\d+\s+|\n(?:判断题|单选题|多选题|程序填空题|函数题|编程题)\b|$)/g;
  const questions: Question[] = [];
  let match: RegExpExecArray | null;

  while ((match = questionPattern.exec(normalized))) {
    const label = match[2];
    const type = TYPE_BY_PREFIX[label.split('-')[0]] ?? { typeName: '未知题型', kind: 'unknown' as const };
    const { prompt, answerBlock } = stripAnswer(match[3]);
    const answer = extractAnswer(answerBlock);
    const options = extractOptions(prompt, type.kind);
    const questionPrompt = stripOptionsFromPrompt(prompt, type.kind);
    const tags = inferTags(questionPrompt);

    questions.push({
      id: `pdf-${meta.sourceId}-${label}`,
      sourceId: meta.sourceId,
      sourceName: meta.sourceName,
      sourceKind: 'past-paper',
      typeName: type.typeName,
      kind: type.kind,
      label,
      title: label,
      prompt: questionPrompt,
      options,
      answer,
      explanation: explainAnswer(answer, tags, type.kind, { prompt: questionPrompt, options }),
      images: [],
      score: null,
      tags
    });
  }

  return questions;
}

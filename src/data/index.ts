import rawQuestions from './questions.generated.json';
import type { Question } from '../lib/types';

export const questions = rawQuestions as Question[];

export const sources = Array.from(
  new Map(questions.map((question) => [question.sourceId, { id: question.sourceId, name: question.sourceName, kind: question.sourceKind }])).values()
);

export const typeNames = Array.from(new Set(questions.map((question) => question.typeName)));

export const tags = Array.from(new Set(questions.flatMap((question) => question.tags))).sort();

export type QuestionKind =
  | 'true-false'
  | 'single-choice'
  | 'multiple-choice'
  | 'fill-blank'
  | 'function'
  | 'programming'
  | 'unknown';

export type SourceKind = 'past-paper' | 'final-practice' | 'homework';

export interface QuestionOption {
  key: string;
  text: string;
}

export interface QuestionImage {
  src: string;
  alt?: string;
}

export interface Question {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceKind: SourceKind;
  typeName: string;
  kind: QuestionKind;
  label: string;
  title: string;
  prompt: string;
  options: QuestionOption[];
  answer?: string[];
  explanation: string;
  images: QuestionImage[];
  score?: number | null;
  url?: string;
  tags: string[];
}

export interface PdfQuestionMeta {
  sourceId: string;
  sourceName: string;
}

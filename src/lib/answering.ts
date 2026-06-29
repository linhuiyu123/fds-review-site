export function normalizeAnswer(answer: string | string[]): string[] {
  const parts = Array.isArray(answer) ? answer : answer.split(/[,\s，、]+/);
  return parts
    .map((part) => part.trim().replace(/[.。]/g, '').toUpperCase())
    .filter(Boolean);
}

export function gradeAnswer(selected: string | string[], expected: string | string[]): boolean {
  const left = normalizeAnswer(selected).sort();
  const right = normalizeAnswer(expected).sort();
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function answerLabel(answer?: string[]): string {
  return answer && answer.length > 0 ? answer.join(', ') : '暂无标准答案';
}

const COPY_UI_LINES = new Set(['复制内容', '格式', '全屏', '收起', '全屏浏览', '切换布局', '测试用例', '无提交记录', '查看上次提交', '提交本题作答']);

const FOOTER_RE = /\n(?:代码长度限制|测试用例\s*\n(?:无提交记录|查看上次提交)|提交本题作答)[\s\S]*$/;
const COMPILER_RE = /\n(?:C|C\+\+)\s*\([^)]+\)\s*\n/gi;

function cleanMathArtifacts(text) {
  return text
    .replace(/\u200b/g, '')
    .replace(/\t?​\s*/g, '')
    .replace(/\s*\d+\s*分\s*/g, ' ___ ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function removeLineNumberRuns(lines) {
  const result = [];
  for (let index = 0; index < lines.length; ) {
    const current = lines[index].trim();
    if (!/^\d+$/.test(current)) {
      result.push(lines[index]);
      index += 1;
      continue;
    }

    let end = index;
    let expected = Number(current);
    while (end < lines.length && lines[end].trim() === String(expected)) {
      end += 1;
      expected += 1;
    }

    const isFirstNonEmptyLine = current === '1' && lines.slice(0, index).every((line) => !line.trim());
    if ((end - index >= 2 && Number(current) === 1) || (isFirstNonEmptyLine && lines.length > index + 1)) {
      index = end;
    } else {
      result.push(lines[index]);
      index += 1;
    }
  }
  return result;
}

function removeInlineCodeChrome(line) {
  return line
    .replace(/\[\s*(?:C|C\+\+|Java|Python)\s*\]\s*/gi, '')
    .replace(/\[\s*(?:in|out)\s*\]\s*/gi, '')
    .replace(/(?:复制内容|格式|全屏浏览|全屏|收起|切换布局)\s*/g, '')
    .replace(
      /^\s*\d+\s+(?=(?:#include|typedef|struct|class|int\b|void\b|char\b|float\b|double\b|long\b|short\b|unsigned\b|for\b|while\b|if\b|else\b|return\b|break\b|continue\b|printf\b|scanf\b|malloc\b|free\b|[A-Za-z_]\w*\s*:|[A-Za-z_][\w\s*]*[=({;]|\/[/*]|\*\/|\{|\}))/,
      ''
    )
    .trimEnd();
}

function numberedLine(line) {
  const match = /^\s*(\d+)(?:\s+(.*))?$/.exec(line);
  if (!match) return undefined;
  return { number: Number(match[1]), rest: match[2] ?? '' };
}

function stripNumberedCopyRuns(lines) {
  const result = [...lines];
  for (let index = 0; index < lines.length; ) {
    const first = numberedLine(lines[index]);
    if (!first) {
      index += 1;
      continue;
    }

    let end = index;
    let expected = first.number;
    while (end < lines.length) {
      const parsed = numberedLine(lines[end]);
      if (!parsed || parsed.number !== expected) break;
      end += 1;
      expected += 1;
    }

    if (end - index >= 2) {
      for (let cursor = index; cursor < end; cursor += 1) {
        result[cursor] = numberedLine(lines[cursor]).rest;
      }
      index = end;
    } else {
      index += 1;
    }
  }
  return result;
}

function stripSampleBlockLineNumbers(lines) {
  let inSampleBlock = false;
  return lines.map((line) => {
    const trimmed = line.trim();
    if (/^Sample (?:Input|Output)/i.test(trimmed)) {
      inSampleBlock = true;
      return line;
    }
    if (!trimmed) return line;

    if (inSampleBlock) {
      const parsed = numberedLine(line);
      if (parsed && parsed.rest) return parsed.rest;
      inSampleBlock = false;
    }
    return line;
  });
}

function cleanCopiedBlock(text) {
  const copiedLines = cleanMathArtifacts(text)
    .split(/\r?\n/)
    .map((line) => removeInlineCodeChrome(line.replace(/[▾]/g, '')))
    .filter((line) => !COPY_UI_LINES.has(line.trim()));
  const lines = stripNumberedCopyRuns(stripSampleBlockLineNumbers(copiedLines)).map(removeInlineCodeChrome);

  return cleanMathArtifacts(removeLineNumberRuns(lines).join('\n'));
}

export function cleanPtaPrompt(prompt, label = '') {
  const withoutFooter = String(prompt ?? '').replace(FOOTER_RE, '');
  const lines = withoutFooter.split(/\r?\n/);
  const cleanedLines = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      cleanedLines.push('');
      continue;
    }
    if (label && index === 0 && (line === label || line.startsWith(`${label} `))) continue;
    if (/^分数\s*\d+/.test(line)) continue;
    if (/^作者\s+/.test(line)) continue;
    if (/^单位\s+/.test(line)) continue;
    if (COPY_UI_LINES.has(line)) continue;
    cleanedLines.push(lines[index]);
  }
  return cleanCopiedBlock(cleanedLines.join('\n'));
}

export function cleanPtaOptionText(text) {
  return cleanCopiedBlock(String(text ?? '').replace(/^[A-D]\.\s*/, ''));
}

export function extractReferenceCode(rawPrompt) {
  const raw = String(rawPrompt ?? '');
  const matches = Array.from(raw.matchAll(COMPILER_RE));
  if (!matches.length) return undefined;
  const start = matches[matches.length - 1].index + matches[matches.length - 1][0].length;
  const tail = raw.slice(start).split(/\n测试用例|\n提交本题作答/)[0];
  const code = cleanCopiedBlock(tail);
  return code && /[;{}#()]|return|void|int|printf|scanf/.test(code) ? code : undefined;
}

export function normalizeQuestionKey(question) {
  const prompt = String(question.prompt ?? '')
    .toLowerCase()
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
  const options = (question.options ?? [])
    .map((option) => String(option.text ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ''))
    .join('|');
  return `${prompt.slice(0, 500)}|${options}`;
}

function questionRank(question) {
  return (question.answer?.length ? 10000 : 0) + (question.referenceAnswer ? 1000 : 0) + (question.sourceKind === 'past-paper' ? 100 : question.sourceKind === 'final-practice' ? 50 : 0);
}

export function dedupeQuestions(questions) {
  const groups = new Map();
  for (const question of questions) {
    const key = normalizeQuestionKey(question);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(question);
  }

  const result = [];
  for (const group of groups.values()) {
    group.sort((left, right) => questionRank(right) - questionRank(left));
    result.push(group[0]);
  }
  return result;
}

function keyOf(question) {
  return `${question.sourceName}|${question.label}`;
}

const MANUAL_ANSWERS = {
  '2023-2024-FDS-秋冬练习1|R1-7': ['T'],
  '2023-2024-FDS-秋冬练习1|R2-2': ['A'],
  '2023-2024-FDS-秋冬练习1|R2-12': ['C'],
  '2023-2024-FDS-秋冬练习1|R2-15': ['C'],
  '2023-2024-FDS-秋冬练习1|R2-21': ['C'],
  '2024-2025FDS期末考试练习2|R2-5': ['C'],
  '2024-2025FDS期末考试练习2|R2-6': ['D'],
  '2024-2025FDS期末考试练习2|R2-8': ['D'],
  '2024-2025FDS期末考试练习2|R2-11': ['C'],
  '2024-2025FDS期末考试练习2|R2-12': ['B'],
  '2024-2025FDS期末考试练习2|R2-13': ['C'],
  '2024-2025FDS期末考试练习2|R2-15': ['A'],
  '2024-2025FDS期末考试练习2|R2-17': ['B'],
  '2024-2025FDS期末考试练习2|R2-19': ['D'],
  '2024-2025FDS期末考试练习2|R2-20': ['C'],
  'ZJUFDS-HW1-YDS2026|1-1': ['T'],
  'ZJUFDS-HW1-YDS2026|1-2': ['F'],
  'ZJUFDS-HW1-YDS2026|1-3': ['T'],
  'ZJUFDS-HW1-YDS2026|1-4': ['T'],
  'ZJUFDS-HW1-YDS2026|1-5': ['T'],
  'ZJUFDS-HW1-YDS2026|2-1': ['B'],
  'ZJUFDS-HW1-YDS2026|2-2': ['B'],
  'ZJUFDS-HW1-YDS2026|2-3': ['D'],
  'ZJUFDS-HW1-YDS2026|2-4': ['B'],
  'ZJUFDS-HW1-YDS2026|2-5': ['B'],
  'ZJUFDS-HW1-YDS2026|2-6': ['B'],
  'ZJUFDS-HW2-YDS2026|1-1': ['F'],
  'ZJUFDS-HW2-YDS2026|1-2': ['F'],
  'ZJUFDS-HW2-YDS2026|2-1': ['D'],
  'ZJUFDS-HW2-YDS2026|2-2': ['A'],
  'ZJUFDS-HW2-YDS2026|2-3': ['D'],
  'ZJUFDS-HW3-YDS2026|1-1': ['F'],
  'ZJUFDS-HW3-YDS2026|1-2': ['T'],
  'ZJUFDS-HW3-YDS2026|2-1': ['C'],
  'ZJUFDS-HW3-YDS2026|2-2': ['B'],
  'ZJUFDS-HW3-YDS2026|2-3': ['A'],
  'ZJUFDS-HW3-YDS2026|2-4': ['B'],
  'ZJUFDS-HW3-YDS2026|2-5': ['A'],
  'ZJUFDS-HW4-YDS2026|1-1': ['T'],
  'ZJUFDS-HW4-YDS2026|1-2': ['F'],
  'ZJUFDS-HW4-YDS2026|2-1': ['D'],
  'ZJUFDS-HW4-YDS2026|2-2': ['B'],
  'ZJUFDS-HW4-YDS2026|2-3': ['B'],
  'ZJUFDS-HW4-YDS2026|2-4': ['B'],
  'ZJUFDS-HW5-YDS2026|1-1': ['T'],
  'ZJUFDS-HW5-YDS2026|1-2': ['F'],
  'ZJUFDS-HW5-YDS2026|1-3': ['F'],
  'ZJUFDS-HW5-YDS2026|2-1': ['C'],
  'ZJUFDS-HW5-YDS2026|2-2': ['C'],
  'ZJUFDS-HW5-YDS2026|2-3': ['C'],
  'ZJUFDS-HW5-YDS2026|2-4': ['A'],
  'ZJUFDS-HW5-YDS2026|2-5': ['C'],
  'ZJUFDS-HW5-YDS2026|2-7': ['D'],
  'ZJUFDS-HW6-YDS2026|1-1': ['F'],
  'ZJUFDS-HW6-YDS2026|1-2': ['F'],
  'ZJUFDS-HW6-YDS2026|2-1': ['D'],
  'ZJUFDS-HW6-YDS2026|2-2': ['C'],
  'ZJUFDS-HW6-YDS2026|2-3': ['C'],
  'ZJUFDS-HW6-YDS2026|2-4': ['C'],
  'ZJUFDS-HW6-YDS2026|2-5': ['B'],
  'ZJUFDS-HW6-YDS2026|2-6': ['D'],
  'ZJUFDS-HW7-YDS2026|1-1': ['T'],
  'ZJUFDS-HW7-YDS2026|1-1#2': ['F'],
  'ZJUFDS-HW7-YDS2026|2-1': ['A'],
  'ZJUFDS-HW7-YDS2026|2-2': ['D'],
  'ZJUFDS-HW7-YDS2026|2-3': ['A'],
  'ZJUFDS-HW7-YDS2026|2-4': ['B'],
  'ZJUFDS-HW8-YDS2026|1-1': ['F'],
  'ZJUFDS-HW8-YDS2026|1-2': ['T'],
  'ZJUFDS-HW8-YDS2026|1-3': ['F'],
  'ZJUFDS-HW8-YDS2026|2-1': ['D'],
  'ZJUFDS-HW8-YDS2026|2-2': ['B'],
  'ZJUFDS-HW8-YDS2026|2-3': ['B'],
  'ZJUFDS-HW8-YDS2026|2-4': ['B'],
  'ZJUFDS-HW8-YDS2026|2-5': ['D'],
  'ZJUFDS-HW9-YDS2026|1-1': ['T'],
  'ZJUFDS-HW9-YDS2026|1-2': ['F'],
  'ZJUFDS-HW9-YDS2026|2-1': ['B'],
  'ZJUFDS-HW9-YDS2026|2-2': ['B'],
  'ZJUFDS-HW9-YDS2026|2-3': ['A'],
  'ZJUFDS-HW9-YDS2026|2-4': ['C'],
  'ZJUFDS-HW10-YDS2026|2-1': ['B'],
  'ZJUFDS-HW10-YDS2026|2-2': ['D'],
  'ZJUFDS-HW10-YDS2026|2-4': ['A'],
  'ZJUFDS-HW10-YDS2026|2-5': ['C'],
  'ZJUFDS-HW11-YDS2026|1-1': ['F'],
  'ZJUFDS-HW11-YDS2026|1-2': ['T'],
  'ZJUFDS-HW11-YDS2026|2-1': ['C'],
  'ZJUFDS-HW11-YDS2026|2-2': ['B'],
  'ZJUFDS-HW11-YDS2026|2-3': ['C'],
  'ZJUFDS-HW11-YDS2026|2-4': ['C'],
  'ZJUFDS-HW11-YDS2026|2-5': ['D'],
  'ZJUFDS-HW12-YDS2026|1-1': ['F'],
  'ZJUFDS-HW12-YDS2026|1-2': ['T'],
  'ZJUFDS-HW12-YDS2026|2-1': ['B'],
  'ZJUFDS-HW12-YDS2026|2-2': ['A'],
  'ZJUFDS-HW12-YDS2026|2-3': ['C'],
  'ZJUFDS-HW13-YDS2026|1-1': ['F'],
  'ZJUFDS-HW13-YDS2026|1-2': ['F'],
  'ZJUFDS-HW13-YDS2026|1-3': ['F'],
  'ZJUFDS-HW13-YDS2026|2-1': ['B'],
  'ZJUFDS-HW13-YDS2026|2-2': ['D'],
  'ZJUFDS-HW13-YDS2026|2-3': ['B'],
  'ZJUFDS-HW13-YDS2026|2-4': ['D'],
  'ZJUFDS-HW13-YDS2026|2-5': ['D'],
  'ZJUFDS-HW14-YDS2026|1-1': ['T'],
  'ZJUFDS-HW14-YDS2026|1-2': ['F'],
  'ZJUFDS-HW14-YDS2026|1-3': ['T'],
  'ZJUFDS-HW14-YDS2026|2-1': ['D'],
  'ZJUFDS-HW14-YDS2026|2-2': ['D'],
  'ZJUFDS-HW14-YDS2026|2-3': ['B'],
  'ZJUFDS-HW14-YDS2026|2-4': ['C'],
  'ZJUFDS-HW14-YDS2026|2-5': ['A'],
  'ZJUFDS-HW14-YDS2026|2-6': ['C'],
  'ZJUFDS-HW15-YDS2026|1-1': ['F'],
  'ZJUFDS-HW15-YDS2026|1-2': ['T'],
  'ZJUFDS-HW15-YDS2026|2-1': ['B'],
  'ZJUFDS-HW15-YDS2026|2-2': ['A'],
  'ZJUFDS-HW15-YDS2026|2-3': ['C'],
  'ZJUFDS-HW15-YDS2026|2-4': ['D'],
  'ZJUFDS-HW15-YDS2026|2-5': ['A']
  ,
  'ZJUFDS-HW15-YDS2026|2-6': ['D'],
  'ZJUFDS-HW15-YDS2026|2-7': ['C']
};

const MANUAL_BY_ID = {
  'pta-2039524756353089536-2039524756374061057': ['F']
};

function selectedOptionText(answer, options = []) {
  return options.filter((option) => answer.includes(option.key)).map((option) => `${option.key}. ${option.text}`).join('；');
}

function objectiveByPattern(question) {
  const prompt = question.prompt.replace(/\s+/g, ' ');
  const options = question.options ?? [];

  if (/tree of degree 3/i.test(prompt) && /nodes of degree 2/i.test(prompt) && /nodes of degree 3/i.test(prompt)) {
    const match = /(\d+)\s+nodes of degree 2.*?(\d+)\s+nodes of degree 3/i.exec(prompt);
    if (match) {
      const leaves = 1 + Number(match[1]) + 2 * Number(match[2]);
      const option = options.find((item) => Number(item.text.match(/\d+/)?.[0]) === leaves);
      if (option) return [option.key];
    }
  }
  if (/parentheses/i.test(prompt) && /properly matched/i.test(prompt)) return [options.find((item) => /stack/i.test(item.text))?.key ?? 'C'];
  if (/minimum spanning tree of a dense graph/i.test(prompt)) return [options.find((item) => /prim/i.test(item.text))?.key ?? 'A'];
  if (/single source shortest path problem for an unweighted DAG/i.test(prompt)) return ['C'];
  if (/Eulerian Circuit/i.test(prompt) && /directed graph/i.test(prompt)) return ['A'];
  if (/contract each component/i.test(prompt) && /strongly connected components/i.test(prompt)) return ['B'];
  if (/average search length for successful searches/i.test(prompt) && /22,\s*43,\s*15/.test(prompt)) return ['B'];
  if (/collision in hashing/i.test(prompt)) return ['C'];
  if (/loading density when the first collision occurs/i.test(prompt) && /18,\s*23,\s*11/.test(prompt)) return ['A'];
  if (/range of a hash table is \[0,\s*18\]/i.test(prompt)) return ['C'];
  if (/Rehashing is required/i.test(prompt) && /NOT necessary/i.test(prompt)) return ['A'];
  return undefined;
}

function fillBlankReference(question) {
  const prompt = question.prompt.replace(/\s+/g, ' ');
  if (/quadratic probing/i.test(prompt) && /Position Find/i.test(prompt)) return ['H->TheCells[CurrentPos] == -1', 'CurrentPos += 2 * ++CollisionNum - 1'];
  if (/swap every two adjacent nodes/i.test(prompt) && /greater than/i.test(prompt) && /even/i.test(prompt)) return ['first->val > second->val && first->val % 2 == 0', 'second->next'];
  if (/FirstHaveRight/i.test(prompt)) return ['a[tree] != 0', '2 * tree + 1'];
  if (/path compression/i.test(prompt) && /Union\/Find/i.test(prompt)) return ['S[root] > 0', 'lead = S[trail]; S[trail] = root; trail = lead'];
  if (/Unweighted/i.test(prompt) && /shortest path/i.test(prompt)) return ['dist[V] = 0', 'dist[W] = dist[V] + 1; path[W] = V'];
  if (/InsertionSort/i.test(prompt)) return ['i > 0 && A[i - 1] > Tmp', 'A[i] = Tmp'];
  if (/Prim's algorithm/i.test(prompt) && /w_adj_mat|weight/.test(prompt)) {
    return {
      answer: ['见参考代码'],
      referenceAnswer: `int total = 0;
for (int k = 0; k < n; ++k) {
  int min_d = INFINITY;
  int min_v = -1;
  for (int i = 0; i < n; ++i) {
    if (!known[i] && dist[i] < min_d) {
      min_d = dist[i];
      min_v = i;
    }
  }
  if (min_v == -1) return -1;
  known[min_v] = 1;
  total += dist[min_v];
  for (int i = 0; i < n; ++i) {
    if (!known[i] && w_adj_mat[min_v][i] > 0 && w_adj_mat[min_v][i] < dist[i]) {
      dist[i] = w_adj_mat[min_v][i];
      prev[i] = min_v;
    }
  }
}
return total;`
    };
  }
  return undefined;
}

function fallbackReference(question) {
  const code = extractReferenceCode(question.rawPrompt);
  if (code) {
    return {
      answer: question.kind === 'function' || question.kind === 'programming' ? ['见参考代码'] : undefined,
      referenceAnswer: code,
      explanation: '参考答案采用题面中可复盘的提交代码；复习时重点看数据结构维护、边界条件和输出格式。'
    };
  }
  if (question.kind === 'function' || question.kind === 'programming') {
    return {
      answer: ['见参考思路'],
      referenceAnswer: '按题意实现对应数据结构或算法；优先检查输入规模、边界条件、输出格式，以及是否破坏原数据结构。',
      explanation: '这类题无法自动判题，参考答案给出复习思路；实际提交时按题目函数签名或输入输出格式实现。'
    };
  }
  return {};
}

export function inferReferenceAnswer(question) {
  if (question.answer?.length) return {};
  const exact = MANUAL_BY_ID[question.id] ?? MANUAL_ANSWERS[keyOf(question)];
  if (exact) {
    return {
      answer: exact,
      explanation: `参考答案：${exact.join(', ')}。${selectedOptionText(exact, question.options)}`
    };
  }

  if (question.kind === 'fill-blank') {
    const blanks = fillBlankReference(question);
    if (Array.isArray(blanks)) return { answer: blanks, explanation: `参考答案：${blanks.join('；')}。` };
    if (blanks) return { ...blanks, explanation: '参考答案见下方。' };
  }

  if (question.kind === 'true-false' || question.kind === 'single-choice' || question.kind === 'multiple-choice') {
    const answer = objectiveByPattern(question);
    if (answer) {
      return {
        answer,
        explanation: `参考答案：${answer.join(', ')}。${selectedOptionText(answer, question.options)}`
      };
    }
  }

  return fallbackReference(question);
}

export function propagateDuplicateAnswers(questions) {
  const answered = new Map();
  for (const question of questions) {
    if (question.answer?.length) answered.set(normalizeQuestionKey(question), question);
  }
  return questions.map((question) => {
    if (question.answer?.length) return question;
    const source = answered.get(normalizeQuestionKey(question));
    if (!source?.answer?.length) return question;
    return {
      ...question,
      answer: source.answer,
      referenceAnswer: source.referenceAnswer,
      explanation: source.explanation
    };
  });
}

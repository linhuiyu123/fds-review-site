import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  cleanPtaOptionText,
  cleanPtaPrompt,
  dedupeQuestions,
  extractReferenceCode,
  inferReferenceAnswer,
  propagateDuplicateAnswers
} from './build-data-utils.mjs';

const root = process.cwd();

const TYPE_BY_PREFIX = {
  '1': { typeName: '判断题', kind: 'true-false' },
  '2': { typeName: '单选题', kind: 'single-choice' },
  '3': { typeName: '多选题', kind: 'multiple-choice' },
  '5': { typeName: '程序填空题', kind: 'fill-blank' },
  '6': { typeName: '函数题', kind: 'function' },
  '7': { typeName: '编程题', kind: 'programming' }
};

const PDF_SOURCES = {
  '2025FDS-Final.txt': {
    sourceId: 'pdf-2024-2025-final',
    sourceName: '2024-2025FDS期末考试练习（PDF 标准答案）'
  },
  '2023-2024-final-solution.txt': {
    sourceId: 'pdf-2023-2024-final',
    sourceName: '2023-2024FDS期末考试练习（PDF 标准答案）'
  },
  '2023-2024-秋冬final-solution.txt': {
    sourceId: 'pdf-2023-2024-autumn-final',
    sourceName: '2023-2024-FDS-秋冬练习1（PDF 标准答案）'
  }
};

function cleanText(value) {
  return String(value ?? '')
    .replace(/\f/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractOptions(prompt, kind) {
  if (kind === 'true-false') {
    return [
      { key: 'T', text: 'T' },
      { key: 'F', text: 'F' }
    ];
  }
  return Array.from(prompt.matchAll(/(^|\s)([A-D])\.\s*([\s\S]*?)(?=\s+[A-D]\.\s|$)/g))
    .map((match) => ({ key: match[2], text: cleanText(cleanPtaOptionText(match[3])) }))
    .filter((option) => option.text);
}

function stripAnswer(promptWithAnswer) {
  const [prompt, ...answerParts] = promptWithAnswer.split(/\|\s*参考答案/);
  const answerBlock = answerParts.join('| 参考答案').split(/\|\s*评测详情/)[0] ?? '';
  return { prompt: cleanText(prompt), answerBlock: cleanText(answerBlock) };
}

function extractAnswer(answerBlock) {
  const blanks = Array.from(answerBlock.matchAll(/填空#\d+\s+([^\n]+)/g)).map((match) => cleanText(match[1]));
  if (blanks.length) return blanks;
  const objective = /答案\s+([A-DTF](?:\s*[,，、]\s*[A-DTF])*)/.exec(answerBlock);
  if (!objective) return undefined;
  return objective[1].split(/[,，、\s]+/).map((item) => item.trim().toUpperCase()).filter(Boolean);
}

function stripOptionsFromPrompt(prompt, kind) {
  if (kind === 'true-false') return cleanText(prompt.replace(/\bT\s+F\b/g, ''));
  const firstOption = prompt.search(/(^|\s)A\.\s/);
  return firstOption >= 0 ? cleanText(prompt.slice(0, firstOption)) : cleanText(prompt);
}

function inferTags(prompt) {
  const rules = [
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
    const graphOnly = tags.filter((tag) => tag !== 'Tree');
    return graphOnly.length ? graphOnly : ['Graph'];
  }
  return tags.length ? tags : ['FDS'];
}

const KNOWLEDGE_FOCUS = {
  Graph: '图题高频考 DFS/BFS、连通性、割点/双连通、最短路、最小生成树、拓扑排序、欧拉路和最大流；先分清有向/无向、权值、入度出度和算法适用条件。',
  Tree: '树题重点是遍历序列还原、完全二叉树编号、线索二叉树、树的度和叶子数关系；先写出根、左右子树和层次关系再判断。',
  Sorting: '排序题重点是 Shell/Merge/Quick/Heap/Radix 的每一趟结果、稳定性和比较次数；按算法真实执行过程逐趟推，不要只看最终有序性。',
  Heap: '堆题重点是建堆、插入、DeleteMin/DeleteMax、d-heap 父子下标和层序数组；判断时检查父子大小关系是否全局满足。',
  Hashing: '散列题重点是线性探测、平方探测、装填因子、成功/失败查找探测次数；逐个插入并标出冲突链最稳。',
  BST: 'BST 题重点是插入路径、查找路径、前中后序和层序约束；中序必须有序，前/后序可用上下界递归验证。',
  'Disjoint Set': '并查集题重点是 union-by-size/height、路径压缩后的父数组和树高；每次 Union 前先 Find，压缩会改变沿途父节点。',
  'Stack/Queue': '栈和队列题重点是表达式转换、括号匹配、循环队列 front/rear 定义；先确认空满判定和操作顺序。',
  Complexity: '复杂度题重点是 O/Ω/Θ 定义、递推、对数和阶乘增长率；比较增长率时忽略常数但不能忽略主导项。',
  FDS: '综合题通常混合基本数据结构定义和算法边界条件；先识别题型，再把不满足定义或适用条件的选项排除。'
};

function focusForTags(tags) {
  return Array.from(new Set(tags.length ? tags : ['FDS']))
    .map((tag) => KNOWLEDGE_FOCUS[tag] ?? KNOWLEDGE_FOCUS.FDS)
    .join(' ');
}

function answerPrefix(answer) {
  return `选 ${answer.join(', ')}`;
}

function optionText(answer, options) {
  if (!answer?.length || !options?.length) return '';
  const selected = options.filter((option) => answer.includes(option.key));
  if (!selected.length) return '';
  return `正确选项是 ${selected.map((option) => `${option.key}. ${option.text}`).join('；')}。`;
}

function specificExplanation(answer, context) {
  if (!answer?.length) return undefined;
  const prompt = typeof context === 'string' ? context : context?.prompt ?? '';
  const options = typeof context === 'string' ? undefined : context?.options;
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const prefix = answerPrefix(answer);

  if (/minimum spanning tree|最小生成树/.test(lower) && /prim/i.test(normalized) && /kruskal/i.test(normalized)) {
    const sparse = /sparse|稀疏/.test(lower);
    const dense = /dense|稠密/.test(lower);
    const statedPrimBetter = /prim['’]?s algorithm .*more suitable than kruskal|prim.*更适合.*kruskal/i.test(normalized);
    const statedKruskalBetter = /kruskal['’]?s algorithm .*more suitable than prim|kruskal.*更适合.*prim/i.test(normalized);
    const expected = sparse ? 'Kruskal' : dense ? 'Prim' : '';
    const statement =
      expected && ((expected === 'Prim' && statedPrimBetter) || (expected === 'Kruskal' && statedKruskalBetter))
        ? '题干的比较方向是对的'
        : '题干把适用场景说反了';
    return `${prefix}。这题考最小生成树算法的适用场景：Kruskal 是按边权排序、从小到大选边，并用并查集避免成环，复杂度主要受边数 E 影响，所以稀疏图更合适；Prim 是按点/顶点集合向外扩展，每次选跨割最小边，用邻接矩阵时更适合稠密图。${statement}，因此答案为 ${answer.join(', ')}。`;
  }

  if (/(min-heap|max-heap|最小堆|最大堆)/i.test(normalized) && /level/i.test(lower)) {
    return `${prefix}。堆只保证每个父节点与直接孩子满足大小关系：最小堆父节点不大于孩子，最大堆父节点不小于孩子。它不保证“第 i 层任意结点”都比“第 j 层任意结点”更小或更大，不同子树之间没有全局顺序，所以这种跨层任意比较不成立。`;
  }

  if (/union-by-height|按高度合并|height.*disjoint/i.test(normalized)) {
    return `${prefix}。按高度合并时，只有两棵等高树合并才会让新根高度加 1；不等高时把矮树接到高树下，高度不变。因此高度为 h 的树至少有 2^h 个结点，n 个结点的高度不会超过 floor(log2 n)。`;
  }

  if (/quadratic probing|平方探测/i.test(normalized)) {
    return `${prefix}。平方探测不是“表还空一半就一定插入成功”。常见保证还依赖表长为合适的素数、负载因子小于 1/2 等条件；如果表长或探测序列条件不满足，探测位置可能提前循环，即使还有空槽也可能插入失败。`;
  }

  if (/one pass of radix sort|一趟.*基数排序/i.test(normalized)) {
    return `${prefix}。基数排序的一趟只按某一位数字稳定分配和收集，通常只能保证这一位的相对次序，不会直接得到整体升序。题干给出的结果已经像完全排序后的序列，因此不能作为“一趟”后的必然结果。`;
  }

  if (/merge sort/i.test(normalized) && /number of comparisons/i.test(normalized)) {
    return `${prefix}。归并排序每层都把序列分成固定规模的子序列再归并，比较次数的数量级稳定为 O(n log n)，初始序列是否接近有序不会改变数量级。`;
  }

  if (/(quicksort|quick sort|insertion sort)/i.test(normalized) && /number of comparisons/i.test(normalized)) {
    return `${prefix}。快速排序和插入排序的比较次数会受初始序列影响：快速排序取到极端划分时会退化，插入排序在接近有序时更省比较和移动。因此说数量级与初始状态无关是不对的。`;
  }

  const degreeMatch = /(\d+)\s+nodes of degree 2.*?(\d+)\s+nodes of degree 3/i.exec(normalized);
  if (/tree of degree 3/i.test(normalized) && degreeMatch) {
    const degree2 = Number(degreeMatch[1]);
    const degree3 = Number(degreeMatch[2]);
    const leaves = degree2 + 2 * degree3 + 1;
    return `${prefix}。树中叶子数可用公式 n0 = 1 + n2 + 2n3 计算，因为边数等于总结点数减 1。这里 n2=${degree2}、n3=${degree3}，所以叶子数 n0 = 1 + ${degree2} + 2×${degree3} = ${leaves}。${optionText(answer, options)}`;
  }

  if (/doubly linked circular list|双向循环链表/i.test(normalized) && /insert .* after/i.test(lower)) {
    return `${prefix}。在双向循环链表中把 q 插到 p 后面，需要同时维护前驱和后继：q->next 指向 p 原来的后继，q->prev 指向 p，原后继->prev 改为 q，p->next 改为 q，一共更新 4 个指针。${optionText(answer, options)}`;
  }

  if (/parentheses|括号/i.test(normalized) && /(matched|匹配)/i.test(normalized)) {
    return `${prefix}。括号匹配需要“后出现的左括号先被匹配”，这是后进先出关系；栈正好支持 push 左括号、遇到右括号 pop 检查，因此最适合。队列是先进先出，不能自然处理嵌套。${optionText(answer, options)}`;
  }

  if (/binary search tree|bst|二叉搜索树/i.test(normalized)) {
    return `${prefix}。BST 的核心约束是左子树所有键小于根，右子树所有键大于根；判断选项时要沿插入、删除或遍历路径维护这个上下界。${optionText(answer, options)}`;
  }

  return undefined;
}

function buildExplanation(answer, tags, kind, context) {
  const specific = specificExplanation(answer, context);
  if (specific) return specific;

  const focus = focusForTags(tags);
  if (!answer?.length) {
    return `暂无可自动判题答案。复习时按知识点自评：${focus}`;
  }
  if (kind === 'fill-blank') {
    return `填空答案：${answer.join('；')}。这些空应保证代码逻辑、指针/下标更新和边界条件同时成立；复盘时按语句执行顺序检查。${focus}`;
  }
  if (kind === 'function' || kind === 'programming') {
    return `参考答案见下方。复习时重点检查算法思路、数据结构维护、边界条件和输出格式。${focus}`;
  }
  const options = typeof context === 'string' ? undefined : context?.options;
  return `${answerPrefix(answer)} 的依据：${optionText(answer, options)}${focus} 排除其它选项时，重点检查定义是否被反向、算法适用条件是否不满足、边界条件是否被忽略。`;
}

function parsePdfQuestions(text, meta) {
  const normalized = cleanText(text);
  const questionPattern = /(^|\n)(\d+-\d+-\d+)\s+([\s\S]*?)(?=\n\d+-\d+-\d+\s+|\n(?:判断题|单选题|多选题|程序填空题|函数题|编程题)\b|$)/g;
  const questions = [];
  let match;
  while ((match = questionPattern.exec(normalized))) {
    const label = match[2];
    const type = TYPE_BY_PREFIX[label.split('-')[0]] ?? { typeName: '未知题型', kind: 'unknown' };
    const { prompt, answerBlock } = stripAnswer(match[3]);
    const answer = extractAnswer(answerBlock);
    const options = extractOptions(prompt, type.kind);
    const questionPrompt = cleanText(cleanPtaPrompt(stripOptionsFromPrompt(prompt, type.kind), label));
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
      explanation: buildExplanation(answer, tags, type.kind, { prompt: questionPrompt, options }),
      images: [],
      score: null,
      tags
    });
  }
  return questions;
}

function typeFromCode(code) {
  return TYPE_BY_PREFIX[String(code)] ?? { typeName: '未知题型', kind: 'unknown' };
}

function normalizePtaOption(option, kind) {
  const text = cleanText(cleanPtaOptionText(option.text));
  if (kind === 'true-false') return { key: text.toUpperCase(), text: text.toUpperCase() };
  return { key: option.key || text.match(/^[A-D]/)?.[0] || '', text: text.replace(/^[A-D]\.\s*/, '') };
}

function normalizePta(raw) {
  return raw.results.flatMap((set) =>
    set.questions.map((question, index) => {
      const type = typeFromCode(question.typeCode);
      const rawPrompt = cleanText(question.prompt);
      const prompt = cleanText(cleanPtaPrompt(rawPrompt, question.label || question.title || ''));
      const options = (question.options ?? []).map((option) => normalizePtaOption(option, type.kind));
      const normalized = {
        id: `pta-${set.id}-${question.pintiaId || index}`,
        sourceId: `pta-${set.id}`,
        sourceName: set.name,
        sourceKind: set.kind,
        typeName: type.typeName,
        kind: type.kind,
        label: question.label || question.title || `P${index + 1}`,
        title: question.title && question.title !== question.label ? question.title : question.label || `P${index + 1}`,
        prompt,
        options,
        rawPrompt,
        referenceAnswer: extractReferenceCode(rawPrompt),
        images: (question.images ?? []).filter((image) => image.src).map((image) => ({ src: image.src, alt: image.alt || '' })),
        score: question.score ?? null,
        url: question.url,
        tags: inferTags(`${question.title ?? ''}\n${prompt}`)
      };
      const inferred = inferReferenceAnswer(normalized);
      const answer = inferred.answer;
      return {
        ...normalized,
        answer,
        referenceAnswer: inferred.referenceAnswer ?? normalized.referenceAnswer,
        explanation: inferred.explanation ?? buildExplanation(answer, normalized.tags, type.kind, { prompt, options })
      };
    })
  );
}

async function downloadImages(questions) {
  const assetDir = path.join(root, 'public', 'assets', 'pintia');
  await fs.mkdir(assetDir, { recursive: true });
  const byUrl = new Map();
  for (const question of questions) {
    for (const image of question.images) {
      if (image.src.startsWith('/')) continue;
      byUrl.set(image.src, null);
    }
  }

  for (const src of byUrl.keys()) {
    try {
      const url = new URL(src);
      const ext = path.extname(url.pathname) || '.png';
      const name = `${crypto.createHash('sha1').update(src).digest('hex').slice(0, 16)}${ext}`;
      const filePath = path.join(assetDir, name);
      try {
        await fs.access(filePath);
      } catch {
        const response = await fetch(src);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
      }
      byUrl.set(src, `/assets/pintia/${name}`);
    } catch (error) {
      console.warn(`Image download failed: ${src} (${error.message})`);
      byUrl.set(src, src);
    }
  }

  for (const question of questions) {
    question.images = question.images.map((image) => ({ ...image, src: byUrl.get(image.src) || image.src }));
  }
}

async function main() {
  const rawPta = JSON.parse(await fs.readFile(path.join(root, 'data', 'pintia-scrape-raw.json'), 'utf8'));
  const ptaQuestions = normalizePta(rawPta);

  const pdfQuestions = [];
  for (const [fileName, meta] of Object.entries(PDF_SOURCES)) {
    const text = await fs.readFile(path.join(root, 'data', 'pdf-text', fileName), 'utf8');
    pdfQuestions.push(...parsePdfQuestions(text, meta));
  }

  let questions = [...pdfQuestions, ...ptaQuestions].map((question) => {
    const inferred = inferReferenceAnswer(question);
    if (!inferred.answer && !inferred.referenceAnswer) return question;
    const answer = inferred.answer ?? question.answer;
    return {
      ...question,
      answer,
      referenceAnswer: inferred.referenceAnswer ?? question.referenceAnswer,
      explanation: inferred.explanation ?? buildExplanation(answer, question.tags, question.kind, { prompt: question.prompt, options: question.options })
    };
  });
  questions = propagateDuplicateAnswers(questions).map((question) => ({
    ...question,
    explanation: buildExplanation(question.answer, question.tags, question.kind, { prompt: question.prompt, options: question.options })
  }));
  const beforeDedupe = questions.length;
  questions = dedupeQuestions(questions);
  await downloadImages(questions);
  questions = questions.map(({ rawPrompt, ...question }) => question);

  await fs.mkdir(path.join(root, 'src', 'data'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'data', 'questions.generated.json'), `${JSON.stringify(questions, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    path.join(root, 'data', 'generated-summary.json'),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      total: questions.length,
      duplicatesRemoved: beforeDedupe - questions.length,
      missingAnswers: questions.filter((question) => !question.answer?.length && !question.referenceAnswer).length,
      bySourceKind: questions.reduce((acc, question) => {
        acc[question.sourceKind] = (acc[question.sourceKind] ?? 0) + 1;
        return acc;
      }, {}),
      byType: questions.reduce((acc, question) => {
        acc[question.typeName] = (acc[question.typeName] ?? 0) + 1;
        return acc;
      }, {})
    }, null, 2)}\n`,
    'utf8'
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

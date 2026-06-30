import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  CheckCircle2,
  Eye,
  ListFilter,
  RotateCcw,
  Search,
  Shuffle,
  XCircle
} from 'lucide-react';
import { questions, sources, tags, typeNames } from './data';
import { answerLabel, gradeAnswer } from './lib/answering';
import {
  applyAttempt,
  emptyProgress,
  toggleWrongBook,
  updateWrongNote,
  type ProgressState
} from './lib/progress';
import type { Question } from './lib/types';

const STORAGE_KEY = 'fds-review-progress-v1';

type SourceKindFilter = 'all' | 'past-paper' | 'final-practice' | 'homework';

function loadProgress(): ProgressState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ProgressState) : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function isObjective(question: Question) {
  return ['true-false', 'single-choice', 'multiple-choice'].includes(question.kind);
}

export function App() {
  const [query, setQuery] = useState('');
  const [sourceKind, setSourceKind] = useState<SourceKindFilter>('all');
  const [sourceId, setSourceId] = useState('all');
  const [typeName, setTypeName] = useState('all');
  const [tag, setTag] = useState('all');
  const [wrongOnly, setWrongOnly] = useState(false);
  const [answerOnly, setAnswerOnly] = useState(false);
  const [order, setOrder] = useState<string[]>(() => questions.map((question) => question.id));
  const [index, setIndex] = useState(0);
  const [selection, setSelection] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  const orderedQuestions = useMemo(() => {
    const byId = new Map(questions.map((question) => [question.id, question]));
    return order.map((id) => byId.get(id)).filter(Boolean) as Question[];
  }, [order]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orderedQuestions.filter((question) => {
      if (sourceKind !== 'all' && question.sourceKind !== sourceKind) return false;
      if (sourceId !== 'all' && question.sourceId !== sourceId) return false;
      if (typeName !== 'all' && question.typeName !== typeName) return false;
      if (tag !== 'all' && !question.tags.includes(tag)) return false;
      if (wrongOnly && !progress.wrongBook[question.id]) return false;
      if (answerOnly && !question.answer?.length) return false;
      if (!needle) return true;
      return `${question.sourceName} ${question.label} ${question.title} ${question.prompt} ${question.tags.join(' ')}`
        .toLowerCase()
        .includes(needle);
    });
  }, [answerOnly, orderedQuestions, progress.wrongBook, query, sourceId, sourceKind, tag, typeName, wrongOnly]);

  const currentIndex = Math.min(index, Math.max(filtered.length - 1, 0));
  const current = filtered[currentIndex];
  const wrongCount = Object.keys(progress.wrongBook).length;
  const attemptedCount = Object.keys(progress.attempts).length;
  const correctCount = Object.values(progress.attempts).filter((attempt) => attempt.lastCorrect).length;

  useEffect(() => {
    setIndex(0);
    setSelection([]);
    setRevealed(false);
    setLastCorrect(null);
  }, [query, sourceKind, sourceId, typeName, tag, wrongOnly, answerOnly]);

  function move(delta: number) {
    setIndex((value) => Math.min(Math.max(value + delta, 0), Math.max(filtered.length - 1, 0)));
    setSelection([]);
    setRevealed(false);
    setLastCorrect(null);
  }

  function choose(key: string) {
    if (!current) return;
    if (current.kind === 'multiple-choice') {
      setSelection((existing) => (existing.includes(key) ? existing.filter((item) => item !== key) : [...existing, key]));
    } else {
      setSelection([key]);
    }
  }

  function submit() {
    if (!current?.answer?.length) {
      setRevealed(true);
      return;
    }
    const correct = gradeAnswer(selection, current.answer);
    setProgress((state) => applyAttempt(state, current.id, correct));
    setLastCorrect(correct);
    setRevealed(true);
  }

  function toggleWrong() {
    if (!current) return;
    setProgress((state) => toggleWrongBook(state, current.id));
  }

  function updateNote(note: string) {
    if (!current) return;
    setProgress((state) => updateWrongNote(state, current.id, note));
  }

  function resetFilters() {
    setQuery('');
    setSourceKind('all');
    setSourceId('all');
    setTypeName('all');
    setTag('all');
    setWrongOnly(false);
    setAnswerOnly(false);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BookOpen size={22} />
          <div>
            <h1>FDS 期末复习</h1>
            <p>PDF 标准答案 + PTA 作业题库</p>
          </div>
        </div>

        <div className="stat-grid">
          <div>
            <strong>{questions.length}</strong>
            <span>总题数</span>
          </div>
          <div>
            <strong>{wrongCount}</strong>
            <span>错题</span>
          </div>
          <div>
            <strong>{attemptedCount}</strong>
            <span>已练</span>
          </div>
          <div>
            <strong>{correctCount}</strong>
            <span>最近答对</span>
          </div>
        </div>

        <section className="filter-block">
          <div className="filter-title">
            <ListFilter size={16} />
            <span>筛选</span>
          </div>
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题干、来源、知识点" />
          </label>

          <label>
            来源类型
            <select value={sourceKind} onChange={(event) => setSourceKind(event.target.value as SourceKindFilter)}>
              <option value="all">全部</option>
              <option value="past-paper">历年卷 PDF</option>
              <option value="final-practice">PTA 期末练习</option>
              <option value="homework">PTA 作业</option>
            </select>
          </label>

          <label>
            题目来源
            <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
              <option value="all">全部来源</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            题型
            <select value={typeName} onChange={(event) => setTypeName(event.target.value)}>
              <option value="all">全部题型</option>
              {typeNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label>
            知识点
            <select value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="all">全部知识点</option>
              {tags.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="check-row">
            <input type="checkbox" checked={answerOnly} onChange={(event) => setAnswerOnly(event.target.checked)} />
            只看可自动判题
          </label>
          <label className="check-row">
            <input type="checkbox" checked={wrongOnly} onChange={(event) => setWrongOnly(event.target.checked)} />
            只看错题本
          </label>

          <button className="secondary-btn" onClick={resetFilters}>
            <RotateCcw size={16} />
            重置筛选
          </button>
        </section>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">当前练习</p>
            <h2>{current ? `第 ${currentIndex + 1} / ${filtered.length} 题` : '没有匹配题目'}</h2>
          </div>
          <div className="top-actions">
            <button className="secondary-btn" onClick={() => setOrder(shuffle(order))}>
              <Shuffle size={16} />
              随机顺序
            </button>
            <button className="secondary-btn" onClick={() => move(-1)} disabled={index <= 0}>
              上一题
            </button>
            <button className="primary-btn" onClick={() => move(1)} disabled={index >= filtered.length - 1}>
              下一题
            </button>
          </div>
        </header>

        {current ? (
          <QuestionPanel
            question={current}
            selection={selection}
            revealed={revealed}
            lastCorrect={lastCorrect}
            wrongEntry={progress.wrongBook[current.id]}
            onChoose={choose}
            onSubmit={submit}
            onReveal={() => setRevealed(true)}
            onToggleWrong={toggleWrong}
            onNote={updateNote}
          />
        ) : (
          <section className="empty-state">没有符合筛选条件的题目。</section>
        )}
      </main>
    </div>
  );
}

interface QuestionPanelProps {
  question: Question;
  selection: string[];
  revealed: boolean;
  lastCorrect: boolean | null;
  wrongEntry: ProgressState['wrongBook'][string] | undefined;
  onChoose: (key: string) => void;
  onSubmit: () => void;
  onReveal: () => void;
  onToggleWrong: () => void;
  onNote: (note: string) => void;
}

function QuestionPanel({
  question,
  selection,
  revealed,
  lastCorrect,
  wrongEntry,
  onChoose,
  onSubmit,
  onReveal,
  onToggleWrong,
  onNote
}: QuestionPanelProps) {
  const gradable = Boolean(question.answer?.length);

  return (
    <section className="question-panel">
      <div className="question-heading">
        <div>
          <p className="question-label">{question.label}</p>
          {question.title && question.title !== question.label ? <h3>{question.title}</h3> : null}
        </div>
      </div>

      <article className="prompt-text">{question.prompt}</article>

      {question.images.length ? (
        <div className="image-strip">
          {question.images.map((image) => (
            <img key={image.src} src={image.src} alt={image.alt || '题目图片'} />
          ))}
        </div>
      ) : null}

      {question.options.length ? (
        <div className="options-list">
          {question.options.map((option) => {
            const selected = selection.includes(option.key);
            const correct = question.answer?.includes(option.key);
            const showCorrect = revealed && correct;
            const showWrong = revealed && selected && !correct;
            return (
              <button
                key={`${option.key}-${option.text}`}
                className={`option-btn ${selected ? 'selected' : ''} ${showCorrect ? 'correct' : ''} ${showWrong ? 'wrong' : ''}`}
                onClick={() => onChoose(option.key)}
              >
                <span>{option.key}</span>
                <p>{option.text}</p>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="answer-actions">
        {isObjective(question) ? (
          <button className="primary-btn" onClick={onSubmit} disabled={gradable && selection.length === 0}>
            {gradable ? '提交并判题' : '查看说明'}
          </button>
        ) : (
          <button className="primary-btn" onClick={onReveal}>
            <Eye size={16} />
            查看答案/解析
          </button>
        )}
        <button className="secondary-btn" onClick={onReveal}>
          <Eye size={16} />
          直接看解析
        </button>
        {lastCorrect === true ? <span className="result-pass"><CheckCircle2 size={16} /> 答对了</span> : null}
        {lastCorrect === false ? <span className="result-fail"><XCircle size={16} /> 已加入错题本</span> : null}
        {revealed || wrongEntry ? (
          <button className={wrongEntry ? 'warning-btn active' : 'warning-btn'} onClick={onToggleWrong}>
            <Bookmark size={16} />
            {wrongEntry ? '已加入错题' : '加入错题'}
          </button>
        ) : null}
      </div>

      {revealed ? (
        <section className="explanation">
          <div>
            <p className="eyebrow">标准答案</p>
            <strong>{answerLabel(question.answer)}</strong>
          </div>
          <p>{question.explanation}</p>
          {question.referenceAnswer ? <pre className="reference-answer">{question.referenceAnswer}</pre> : null}
        </section>
      ) : null}

      {wrongEntry ? (
        <section className="wrong-note">
          <label>
            错题笔记
            <textarea value={wrongEntry.note} onChange={(event) => onNote(event.target.value)} placeholder="记录易错点、推导过程或需要回看的知识点" />
          </label>
        </section>
      ) : null}
    </section>
  );
}

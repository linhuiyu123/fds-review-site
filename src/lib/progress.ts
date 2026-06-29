export interface AttemptSummary {
  total: number;
  correct: number;
  lastCorrect: boolean;
  updatedAt: string;
}

export interface WrongBookEntry {
  questionId: string;
  reason: string;
  note: string;
  addedAt: string;
}

export interface ProgressState {
  attempts: Record<string, AttemptSummary>;
  wrongBook: Record<string, WrongBookEntry>;
}

export function emptyProgress(): ProgressState {
  return { attempts: {}, wrongBook: {} };
}

export function applyAttempt(
  state: ProgressState,
  questionId: string,
  correct: boolean,
  now = new Date().toISOString()
): ProgressState {
  const previous = state.attempts[questionId] ?? { total: 0, correct: 0, lastCorrect: false, updatedAt: now };
  const attempts = {
    ...state.attempts,
    [questionId]: {
      total: previous.total + 1,
      correct: previous.correct + (correct ? 1 : 0),
      lastCorrect: correct,
      updatedAt: now
    }
  };

  const wrongBook = { ...state.wrongBook };
  if (!correct) {
    wrongBook[questionId] = wrongBook[questionId] ?? {
      questionId,
      reason: '答错自动加入',
      note: '',
      addedAt: now
    };
  }

  return { attempts, wrongBook };
}

export function toggleWrongBook(
  state: ProgressState,
  questionId: string,
  note = '',
  now = new Date().toISOString()
): ProgressState {
  const wrongBook = { ...state.wrongBook };
  if (wrongBook[questionId]) {
    delete wrongBook[questionId];
  } else {
    wrongBook[questionId] = { questionId, reason: '手动加入', note, addedAt: now };
  }
  return { ...state, wrongBook };
}

export function updateWrongNote(state: ProgressState, questionId: string, note: string): ProgressState {
  const entry = state.wrongBook[questionId];
  if (!entry) return state;
  return {
    ...state,
    wrongBook: {
      ...state.wrongBook,
      [questionId]: { ...entry, note }
    }
  };
}

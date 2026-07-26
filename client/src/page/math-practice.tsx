import { useState, useRef, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useSiteConfig } from '../hooks/useSiteConfig';

type Difficulty = 'easy' | 'normal' | 'hard';
type Operation = '+' | '-' | '×';

interface Question {
  op: Operation;
  a: number;
  b: number;
  answer: number;
}

function generateQuestions(difficulty: Difficulty): Question[] {
  const questions: Question[] = [];
  for (let i = 0; i < 10; i++) {
    let op: Operation;
    if (difficulty === 'easy' || difficulty === 'normal') {
      op = Math.random() > 0.5 ? '+' : '-';
    } else {
      const r = Math.random();
      op = r < 0.33 ? '+' : r < 0.66 ? '-' : '×';
    }

    const maxPlusMinus = difficulty === 'easy' ? 20 : 50;
    
    let a, b, answer;
    if (op === '×') {
      a = Math.floor(Math.random() * 9) + 1; // 1-9
      b = Math.floor(Math.random() * 9) + 1; // 1-9
      answer = a * b;
    } else {
      a = Math.floor(Math.random() * maxPlusMinus) + 1;
      b = Math.floor(Math.random() * maxPlusMinus) + 1;
      if (op === '-') {
        if (a < b) { const temp = a; a = b; b = temp; }
        answer = a - b;
      } else {
        answer = a + b;
      }
    }
    questions.push({ op, a, b, answer });
  }
  return questions;
}

export function MathPracticeGamePage() {
  const siteConfig = useSiteConfig();
  const { t } = useTranslation();
  
  const [gameState, setGameState] = useState<'setup' | 'playing' | 'result'>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Live timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (gameState === 'playing') {
      interval = setInterval(() => {
        setCurrentTime(Date.now());
      }, 100);
    }
    return () => clearInterval(interval);
  }, [gameState]);

  const handleStart = () => {
    setQuestions(generateQuestions(difficulty));
    setCurrentIndex(0);
    setUserAnswers([]);
    setCurrentInput('');
    const now = Date.now();
    setStartTime(now);
    setCurrentTime(now);
    setGameState('playing');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentInput.trim()) return;
    
    const newAnswers = [...userAnswers, currentInput.trim()];
    setUserAnswers(newAnswers);
    setCurrentInput('');
    
    if (currentIndex < 9) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setEndTime(Date.now());
      setGameState('result');
    }
  };

  const handleReset = () => {
    setGameState('setup');
  };

  const getScore = () => {
    return questions.reduce((score, q, idx) => {
      const isCorrect = parseInt(userAnswers[idx]) === q.answer;
      return score + (isCorrect ? 1 : 0);
    }, 0);
  };

  const timeTaken = ((endTime - startTime) / 1000).toFixed(1);

  return <main className='mx-auto flex w-full max-w-5xl flex-col gap-5 py-4'>
    <Helmet><title>{siteConfig.name} - {t("math_practice_title", "Math Practice")}</title></Helmet>
    
    <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
      <section>
        <Link href='/game' className='text-sm font-medium text-theme hover:underline'>{t("water_fall_all_games", "All Games")}</Link>
        <h1 className='mt-2 text-3xl font-bold text-neutral-900 dark:text-white'>{t("math_practice_title", "Math Practice")}</h1>
        <p className='mt-2 max-w-2xl text-neutral-600 dark:text-neutral-300'>{t("math_practice_description", "Test your calculation speed and accuracy!")}</p>
      </section>
    </div>

    {gameState === 'setup' && (
      <div className='flex flex-col items-center justify-center rounded-3xl border border-sky-200 bg-sky-50 py-16 dark:border-sky-900/60 dark:bg-slate-950'>
        <div className='text-6xl mb-6'>🧮</div>
        <h2 className='text-xl font-bold text-neutral-800 dark:text-neutral-200 mb-6'>{t("math_practice_select_difficulty", "Select Difficulty")}</h2>
        
        <div className='flex flex-col sm:flex-row gap-4 mb-10'>
          {(['easy', 'normal', 'hard'] as Difficulty[]).map(level => (
            <button 
              key={level} 
              onClick={() => setDifficulty(level)}
              className={`px-8 py-4 rounded-2xl font-bold text-lg transition-colors border-2 ${
                difficulty === level 
                  ? 'border-theme bg-theme text-white shadow-md' 
                  : 'border-black/10 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:bg-dark dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              {t(`math_practice_${level}`, level.charAt(0).toUpperCase() + level.slice(1))}
            </button>
          ))}
        </div>
        
        <button 
          onClick={handleStart}
          className='px-12 py-4 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xl shadow-lg transition-transform hover:scale-105 active:scale-95'
        >
          {t("math_practice_start", "Start!")}
        </button>
      </div>
    )}

    {gameState === 'playing' && questions.length > 0 && (
      <div className='flex flex-col items-center justify-center rounded-3xl border border-sky-200 bg-sky-50 py-16 px-4 dark:border-sky-900/60 dark:bg-slate-950'>
        <div className='w-full max-w-md mb-8 flex items-center justify-between'>
          <span className='text-neutral-500 font-semibold uppercase tracking-wider text-sm'>{t('math_practice_question', 'Question')} {currentIndex + 1} / 10</span>
          <div className='flex items-center gap-4'>
            <div className='hidden sm:block h-2 w-24 bg-sky-200 rounded-full overflow-hidden dark:bg-sky-900/50'>
              <div className='h-full bg-theme transition-all duration-300' style={{ width: `${((currentIndex) / 10) * 100}%` }}></div>
            </div>
            <span className='text-theme font-mono font-bold text-lg w-16 text-right tabular-nums'>
              {Math.max(0, (currentTime - startTime) / 1000).toFixed(1)}s
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className='flex flex-col items-center'>
          <div className='flex items-center justify-center gap-4 text-5xl sm:text-7xl font-bold text-neutral-800 dark:text-neutral-100 mb-12 tracking-tight'>
            <span>{questions[currentIndex].a}</span>
            <span className='text-theme'>{questions[currentIndex].op}</span>
            <span>{questions[currentIndex].b}</span>
            <span className='text-neutral-400'>=</span>
          </div>

          <div className='flex items-center gap-4'>
            <input
              ref={inputRef}
              type="text"
              readOnly
              value={currentInput}
              className='w-48 sm:w-64 text-center text-4xl sm:text-5xl font-bold py-4 rounded-2xl border-4 border-sky-200 focus:border-theme bg-white dark:bg-dark dark:border-sky-800 dark:text-white outline-none shadow-inner transition-colors cursor-default select-none'
              placeholder="?"
            />
          </div>
          
          <div className='mt-8 grid grid-cols-6 gap-2 sm:gap-4 w-full max-w-xl px-2'>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setCurrentInput(prev => prev + num)}
                className='flex items-center justify-center h-14 sm:h-16 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-800 border-2 border-sky-100 dark:border-sky-900 shadow-sm text-2xl sm:text-3xl font-bold text-neutral-700 dark:text-neutral-200 hover:bg-sky-50 dark:hover:bg-slate-700 active:scale-95 transition-all'
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCurrentInput(prev => prev.slice(0, -1))}
              className='flex items-center justify-center h-14 sm:h-16 rounded-xl sm:rounded-2xl bg-rose-50 dark:bg-rose-900/30 border-2 border-rose-200 dark:border-rose-900/50 shadow-sm text-2xl text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 active:scale-95 transition-all'
            >
              <i className="ri-delete-back-2-line"></i>
            </button>
            <button
              type="submit"
              disabled={!currentInput.trim()}
              className='flex items-center justify-center h-14 sm:h-16 rounded-xl sm:rounded-2xl bg-theme hover:bg-theme/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg sm:text-xl shadow-sm transition-transform hover:-translate-y-0.5 active:translate-y-0'
            >
              {t('math_practice_ok', 'OK')}
            </button>
          </div>
        </form>
      </div>
    )}

    {gameState === 'result' && (
      <div className='flex flex-col items-center rounded-3xl border border-sky-200 bg-white py-10 px-4 sm:px-10 dark:border-sky-900/60 dark:bg-slate-950'>
        <div className='text-center mb-10'>
          <h2 className='text-3xl sm:text-4xl font-bold text-neutral-900 dark:text-white mb-2'>{t('math_practice_results', 'Results')}</h2>
          <div className='flex flex-wrap justify-center gap-6 mt-6'>
            <div className='flex flex-col items-center p-4 bg-sky-50 dark:bg-sky-900/20 rounded-2xl min-w-[120px]'>
              <span className='text-sm text-neutral-500 font-semibold uppercase tracking-wider mb-1'>{t('math_practice_score', 'Score')}</span>
              <span className='text-4xl font-bold text-theme'>{getScore()}/10</span>
            </div>
            <div className='flex flex-col items-center p-4 bg-sky-50 dark:bg-sky-900/20 rounded-2xl min-w-[120px]'>
              <span className='text-sm text-neutral-500 font-semibold uppercase tracking-wider mb-1'>{t('math_practice_time', 'Time')}</span>
              <span className='text-4xl font-bold text-theme'>{timeTaken}s</span>
            </div>
          </div>
        </div>

        <div className='w-full max-w-2xl overflow-x-auto'>
          <table className='w-full text-left border-collapse'>
            <thead>
              <tr className='border-b-2 border-neutral-100 dark:border-neutral-800'>
                <th className='py-3 px-4 font-semibold text-neutral-500'>{t('math_practice_q', 'Question')}</th>
                <th className='py-3 px-4 font-semibold text-neutral-500'>{t('math_practice_your_answer', 'Your Answer')}</th>
                <th className='py-3 px-4 font-semibold text-neutral-500'>{t('math_practice_correct_answer', 'Correct Answer')}</th>
                <th className='py-3 px-4 font-semibold text-neutral-500 text-center'>{t('math_practice_status', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q, idx) => {
                const userAnswerStr = userAnswers[idx];
                const isCorrect = parseInt(userAnswerStr) === q.answer;
                return (
                  <tr key={idx} className='border-b border-neutral-100 dark:border-neutral-800/50 hover:bg-neutral-50 dark:hover:bg-neutral-900/50'>
                    <td className='py-3 px-4 font-medium text-neutral-800 dark:text-neutral-200 text-lg'>
                      {q.a} {q.op} {q.b}
                    </td>
                    <td className={`py-3 px-4 font-bold text-lg ${isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                      {userAnswerStr}
                    </td>
                    <td className='py-3 px-4 font-bold text-neutral-800 dark:text-neutral-200 text-lg'>
                      {q.answer}
                    </td>
                    <td className='py-3 px-4 text-center'>
                      {isCorrect ? (
                        <i className="ri-checkbox-circle-fill text-2xl text-emerald-500"></i>
                      ) : (
                        <i className="ri-close-circle-fill text-2xl text-red-500"></i>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button 
          onClick={handleReset}
          className='mt-10 px-10 py-3 rounded-xl bg-theme hover:bg-theme/90 text-white font-bold text-lg shadow-sm transition-transform hover:-translate-y-0.5'
        >
          {t("math_practice_play_again", "Play Again")}
        </button>
      </div>
    )}
  </main>;
}

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useSiteConfig } from '../hooks/useSiteConfig';

const WIDTH = 1000;
const HEIGHT = 600;

type GameState = 'idle' | 'charging' | 'kicking' | 'scored' | 'missed';

export function PenaltyKickGamePage() {
  const siteConfig = useSiteConfig();
  const { t } = useTranslation();
  const boardRef = useRef<SVGSVGElement>(null);

  const gameRef = useRef({
    state: 'idle' as GameState,
    keeper: { x: 500, dir: 1 },
    ball: { x: 500, y: 500, z: 0, vx: 0, vy: 0, vz: 0 },
    power: 0,
    swipeStart: { x: 0, y: 0 },
    swipeCurrent: { x: 0, y: 0 },
    score: 0,
    attempts: 0
  });

  const [renderState, setRenderState] = useState(gameRef.current);
  const [difficulty, setDifficulty] = useState<'normal' | 'hard' | 'very_hard'>('normal');
  const difficultyRef = useRef(difficulty);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);

  const toBoard = useCallback((clientX: number, clientY: number) => { 
    const rect = boardRef.current?.getBoundingClientRect(); 
    return rect ? { x: ((clientX - rect.left) / rect.width) * WIDTH, y: ((clientY - rect.top) / rect.height) * HEIGHT } : null; 
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const g = gameRef.current;
      
      // Update Keeper
      const speed = difficultyRef.current === 'normal' ? 6 : difficultyRef.current === 'hard' ? 10 : 15;
      if (g.state === 'kicking') {
        g.keeper.x += g.keeper.dir * speed;
        if (g.keeper.x > 620) { g.keeper.x = 620; g.keeper.dir = -1; }
        if (g.keeper.x < 380) { g.keeper.x = 380; g.keeper.dir = 1; }
      }

      // Update Power
      if (g.state === 'charging') {
        g.power = Math.min(100, g.power + 1.5);
      }

      // Update Ball Physics
      if (g.state === 'kicking') {
        g.ball.z += g.ball.vz;
        g.ball.x += g.ball.vx;
        g.ball.vy += 0.25; // gravity
        g.ball.y += g.ball.vy;
        
        const groundY = 500 - (g.ball.z / 100) * 150; 
        if (g.ball.y > groundY) {
          g.ball.y = groundY;
          g.ball.vy = -g.ball.vy * 0.6; // bounce
        }

        // Goal line crossing
        if (g.ball.z >= 100) {
          g.ball.z = 100;
          const inGoal = g.ball.x > 320 && g.ball.x < 680 && g.ball.y < 350 && g.ball.y > 150;
          const hitKeeper = Math.abs(g.ball.x - g.keeper.x) < 55 && g.ball.y > 200; 

          if (inGoal && !hitKeeper) {
            g.state = 'scored';
            g.score += 1;
            g.attempts += 1;
          } else {
            g.state = 'missed';
            g.attempts += 1;
          }
          
          setTimeout(() => {
            const currentG = gameRef.current;
            if (currentG.state === 'scored' || currentG.state === 'missed') {
              currentG.state = 'idle';
              currentG.ball = { x: 500, y: 500, z: 0, vx: 0, vy: 0, vz: 0 };
              currentG.keeper.x = 500; // Reset keeper to center
            }
          }, 1200);
        }
      }

      // Trigger re-render with a shallow copy of the state
      setRenderState({ 
        ...g, 
        keeper: { ...g.keeper }, 
        ball: { ...g.ball }, 
        swipeStart: { ...g.swipeStart }, 
        swipeCurrent: { ...g.swipeCurrent } 
      });
    }, 20);
    return () => clearInterval(timer);
  }, []);

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gameRef.current;
    if (g.state === 'idle' || g.state === 'scored' || g.state === 'missed') {
      const pt = toBoard(e.clientX, e.clientY);
      if (!pt) return;
      g.state = 'charging';
      g.power = 0;
      g.swipeStart = pt;
      g.swipeCurrent = pt;
      g.ball = { x: 500, y: 500, z: 0, vx: 0, vy: 0, vz: 0 };
      (e.target as Element).setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gameRef.current;
    if (g.state === 'charging') {
      const pt = toBoard(e.clientX, e.clientY);
      if (pt) g.swipeCurrent = pt;
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gameRef.current;
    if (g.state === 'charging') {
      g.state = 'kicking';
      // Randomize keeper dive direction when kick starts (so it's not always diving the same way if it was standing still)
      g.keeper.dir = Math.random() > 0.5 ? 1 : -1;
      
      const dx = g.swipeCurrent.x - g.swipeStart.x;
      
      const p = Math.max(20, g.power);
      g.ball.vz = 2 + (p / 100) * 3;
      g.ball.vy = - (p / 100) * 8 - 3;
      g.ball.vx = dx * 0.05;
      (e.target as Element).releasePointerCapture(e.pointerId);
    }
  };

  const scale = 1 - (renderState.ball.z / 100) * 0.4; // ball shrinks as it moves away

  return <main className='mx-auto flex w-full max-w-5xl flex-col gap-5 py-4'>
    <Helmet><title>{siteConfig.name} - {t("penalty_kick_title", "Penalty Kick")}</title></Helmet>
    <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
      <section>
        <Link href='/game' className='text-sm font-medium text-theme hover:underline'>{t("water_fall_all_games", "All Games")}</Link>
        <h1 className='mt-2 text-3xl font-bold text-neutral-900 dark:text-white'>{t("penalty_kick_title", "Penalty Kick")}</h1>
        <p className='mt-2 max-w-2xl text-neutral-600 dark:text-neutral-300'>{t("penalty_kick_description", "Swipe to aim. Hold for power. Release to kick!")}</p>
      </section>
    </div>
    
    <div className='flex flex-col sm:flex-row gap-4 items-center justify-between rounded-2xl border border-black/10 bg-white px-5 py-4 dark:border-white/10 dark:bg-dark'>
      <div className='flex items-center gap-4 text-sm font-semibold'>
        <span className='text-neutral-500'>{t("penalty_kick_score", "Score")}:</span>
        <span className='text-theme text-xl'>{renderState.score}</span>
        <span className='text-neutral-400 mx-2'>/</span>
        <span className='text-neutral-500'>{t("penalty_kick_attempts", "Attempts")}:</span>
        <span className='text-neutral-800 dark:text-neutral-200 text-xl'>{renderState.attempts}</span>
      </div>
      <p className={`rounded-xl px-4 py-1.5 text-xs font-bold uppercase tracking-wider ${renderState.state === 'scored' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' : renderState.state === 'missed' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}>
        {renderState.state === 'scored' ? t('penalty_kick_goal', 'GOAL!') : renderState.state === 'missed' ? t('penalty_kick_saved', 'SAVED!') : t('penalty_kick_ready', 'READY')}
      </p>
    </div>

    <div className='grid gap-4 md:grid-cols-[minmax(0,1fr)_96px]'>
    <section className='overflow-hidden rounded-3xl border border-sky-200 bg-sky-50 shadow-sm dark:border-sky-900/60 dark:bg-slate-950'>
      <div className='overflow-x-auto p-2 sm:p-4'>
        <svg ref={boardRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className='mx-auto block w-full min-w-[300px] select-none rounded-2xl bg-gradient-to-b from-sky-300 to-sky-100 dark:from-sky-900 dark:to-slate-900' style={{ touchAction: 'none' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
          {/* Ground */}
          <polygon points="0,600 1000,600 800,350 200,350" fill="#4ade80" />
          <polygon points="200,350 800,350 1000,350 1000,0 0,0 0,350" fill="none" />
          
          {/* Goal Frame */}
          <path d="M 300 350 V 150 H 700 V 350" fill="none" stroke="white" strokeWidth="12" strokeLinecap='square' />
          {/* Net (simplified) */}
          <path d="M 300 150 L 250 350 M 700 150 L 750 350" fill="none" stroke="white" strokeWidth="4" strokeOpacity="0.5" />
          {[...Array(10)].map((_, i) => <line key={`net-v-${i}`} x1={300 + i * 40} y1="150" x2={250 + i * 50} y2="350" stroke="white" strokeWidth="2" strokeOpacity="0.3" />)}
          {[...Array(6)].map((_, i) => <line key={`net-h-${i}`} x1={300 - i * 8.3} y1={150 + i * 33.3} x2={700 + i * 8.3} y2={150 + i * 33.3} stroke="white" strokeWidth="2" strokeOpacity="0.3" />)}

          {/* Goalkeeper */}
          <g transform={`translate(${renderState.keeper.x} 260)`}>
            <rect x="-30" y="0" width="60" height="90" rx="10" fill="#facc15" /> {/* Body */}
            <circle cx="0" cy="-20" r="25" fill="#fca5a5" /> {/* Head */}
            <rect x="-40" y="10" width="80" height="20" rx="10" fill="#3b82f6" /> {/* Arms */}
          </g>

          {/* Ball */}
          <g transform={`translate(${renderState.ball.x} ${renderState.ball.y}) scale(${scale})`}>
            <circle cx="0" cy="0" r="20" fill="white" />
            <path d="M 0 -8 L 8 -2 L 5 7 L -5 7 L -8 -2 Z" fill="black" />
            <path d="M 0 -8 L 0 -20 M 8 -2 L 18 -6 M 5 7 L 12 16 M -5 7 L -12 16 M -8 -2 L -18 -6" stroke="black" strokeWidth="3" />
          </g>

          {/* UI Overlays */}
          {renderState.state === 'charging' && (
            <g>
              <rect x="400" y="550" width="200" height="16" rx="8" fill="rgba(255,255,255,0.5)" />
              <rect x="400" y="550" width={renderState.power * 2} height="16" rx="8" fill="#fb923c" />
              {/* Arrow showing direction */}
              {renderState.swipeCurrent.x !== renderState.swipeStart.x && (
                <line 
                  x1={500} 
                  y1={500} 
                  x2={500 + (renderState.swipeCurrent.x - renderState.swipeStart.x)} 
                  y2={500 + Math.min(0, renderState.swipeCurrent.y - renderState.swipeStart.y)} 
                  stroke="rgba(255,255,255,0.8)" 
                  strokeWidth="4" 
                  strokeDasharray="5 5" 
                />
              )}
            </g>
          )}

          {(renderState.state === 'scored' || renderState.state === 'missed') && (
            <text x="500" y="300" textAnchor="middle" fontSize="48" fontWeight="bold" fill="white" className="drop-shadow-lg" style={{ filter: 'drop-shadow(0px 4px 8px rgba(0,0,0,0.5))' }}>
              {renderState.state === 'scored' ? t('penalty_kick_goal_msg', 'WHAT A GOAL!') : t('penalty_kick_missed_msg', 'SAVED BY THE KEEPER!')}
            </text>
          )}
        </svg>
      </div>
    </section>
    <aside className='flex flex-row md:flex-col gap-2'>
      <div className='mb-2 hidden text-center text-xs font-bold text-neutral-400 md:block uppercase tracking-wider'>{t('penalty_kick_difficulty', 'Difficulty')}</div>
      <button type='button' onClick={() => setDifficulty('normal')} className={`flex h-12 md:h-16 w-auto md:w-24 shrink-0 px-3 md:px-0 items-center justify-center rounded-xl border transition-colors ${difficulty === 'normal' ? 'border-sky-500 bg-sky-500 text-white shadow-sm' : 'border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:hover:bg-sky-900'}`}>
        <div className='flex flex-row md:flex-col items-center gap-1.5 md:gap-1'><i className="ri-star-line text-lg md:text-xl"></i><span className='text-xs font-semibold'>{t('penalty_kick_normal', 'Normal')}</span></div>
      </button>
      <button type='button' onClick={() => setDifficulty('hard')} className={`flex h-12 md:h-16 w-auto md:w-24 shrink-0 px-3 md:px-0 items-center justify-center rounded-xl border transition-colors ${difficulty === 'hard' ? 'border-orange-500 bg-orange-500 text-white shadow-sm' : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/40 dark:hover:bg-orange-900'}`}>
        <div className='flex flex-row md:flex-col items-center gap-1.5 md:gap-1'><i className="ri-fire-line text-lg md:text-xl"></i><span className='text-xs font-semibold'>{t('penalty_kick_hard', 'Hard')}</span></div>
      </button>
      <button type='button' onClick={() => setDifficulty('very_hard')} className={`flex h-12 md:h-16 w-auto md:w-24 shrink-0 px-3 md:px-0 items-center justify-center rounded-xl border transition-colors ${difficulty === 'very_hard' ? 'border-red-500 bg-red-500 text-white shadow-sm' : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:hover:bg-red-900'}`}>
        <div className='flex flex-row md:flex-col items-center gap-1.5 md:gap-1'><i className="ri-skull-2-line text-lg md:text-xl"></i><span className='text-xs font-semibold'>{t('penalty_kick_very_hard', 'Very Hard')}</span></div>
      </button>
    </aside>
    </div>
  </main>;
}

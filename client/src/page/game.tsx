import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useSiteConfig } from '../hooks/useSiteConfig';

type Point = { x: number; y: number };
type Direction = 'up' | 'right' | 'down' | 'left';
type PipeType = 'straight' | 'elbow' | 'tee';
type Pipe = { id: number; type: PipeType; x: number; y: number; rotation: number };
type Port = { id: number; direction: Direction; x: number; y: number };
type Drag = { type: 'pipe'; pipeType: PipeType; id?: number; point: Point; rotation: number } | { type: 'pool'; point: Point };

const WIDTH = 1000;
const HEIGHT = 600;
const SOURCE = { x: 200, y: 50 };
const POOL_SIZE = { width: 190, height: 110 };
const TARGET = { x: 750, y: 440 };
const directions: Direction[] = ['up', 'right', 'down', 'left'];
const vectors: Record<Direction, Point> = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
const opposite = (direction: Direction) => directions[(directions.indexOf(direction) + 2) % 4];
const rotate = (direction: Direction, turns: number) => directions[(directions.indexOf(direction) + turns + 4) % 4];
const snap = (point: Point): Point => ({ x: Math.max(100, Math.min(900, Math.round(point.x / 100) * 100)), y: Math.max(100, Math.min(500, Math.round(point.y / 100) * 100)) });
const clampPool = (point: Point): Point => ({ x: Math.max(20, Math.min(WIDTH - POOL_SIZE.width - 20, point.x)), y: Math.max(40, Math.min(HEIGHT - POOL_SIZE.height - 20, point.y)) });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function getPorts(pipe: Pipe): Port[] {
  let base: Direction[];
  if (pipe.type === 'straight') base = ['left', 'right'];
  else if (pipe.type === 'elbow') base = ['up', 'right'];
  else base = ['left', 'right', 'down'];
  return base.map((direction) => {
    const actual = rotate(direction, pipe.rotation / 90);
    const vector = vectors[actual];
    return { id: pipe.id, direction: actual, x: pipe.x + vector.x * 50, y: pipe.y + vector.y * 50 };
  });
}

function getFlow(pipes: Pipe[]) {
  const all = pipes.flatMap(getPorts);
  const byPosition = new Map<string, Port[]>();
  all.forEach((port) => { const key = `${port.x},${port.y}`; byPosition.set(key, [...(byPosition.get(key) ?? []), port]); });
  const reachable = new Set<number>();
  const joined = new Set<string>();
  const queue: number[] = [];
  all.filter((port) => port.x === SOURCE.x && port.y === SOURCE.y && port.direction === 'up').forEach((port) => { reachable.add(port.id); queue.push(port.id); });
  while (queue.length > 0) {
    const id = queue.shift() as number;
    all.filter((port) => port.id === id).forEach((port) => (byPosition.get(`${port.x},${port.y}`) ?? []).filter((other) => other.id !== id && other.direction === opposite(port.direction)).forEach((other) => {
      joined.add(`${port.id}:${port.direction}`); joined.add(`${other.id}:${other.direction}`);
      if (!reachable.has(other.id)) { reachable.add(other.id); queue.push(other.id); }
    }));
  }
  const outlets = all.filter((port) => reachable.has(port.id) && !joined.has(`${port.id}:${port.direction}`) && port.y !== SOURCE.y);
  return { reachable, outlets };
}



function FlowPath({ pipe }: { pipe: Pipe }) {
  const path = pipe.type === 'straight' ? 'M -42 0 H 42' : pipe.type === 'elbow' ? 'M 0 -42 V 0 H 42' : 'M -42 0 H 42 M 0 0 V 42';
  return (
    <g transform={`translate(${pipe.x} ${pipe.y}) rotate(${pipe.rotation})`} pointerEvents='none'>
      <path d={path} fill='none' stroke='#bae6fd' strokeWidth='12' strokeLinecap='round' strokeLinejoin='round' style={{ filter: 'url(#liquid)' }} />
      <path d={path} fill='none' stroke='#0284c7' strokeWidth='6' strokeLinecap='round' strokeLinejoin='round' strokeDasharray='4 16' className='waterfall-stream' />
    </g>
  );
}
function PipeView({ pipe, selected, onPointerDown, onDoubleClick }: { pipe: Pipe; selected: boolean; onPointerDown: (event: ReactPointerEvent<SVGGElement>) => void; onDoubleClick?: () => void }) {
  return (<g transform={`translate(${pipe.x} ${pipe.y}) rotate(${pipe.rotation})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} cursor='grab' style={{ touchAction: 'none' }}>
    {selected ? <circle r='42' fill='none' stroke='#fb466b' strokeDasharray='5 6' strokeWidth='2' /> : null}
    {pipe.type === 'straight' ? <rect x='-50' y='-14' width='100' height='28' rx='14' fill='#e0f2fe' stroke='#38a7d9' strokeWidth='8' /> : 
     pipe.type === 'elbow' ? (
       <g>
         <path d='M 0 -50 V 0 H 50' fill='none' stroke='#38a7d9' strokeWidth='30' strokeLinecap='round' strokeLinejoin='round' />
         <path d='M 0 -46 V 0 H 46' fill='none' stroke='#e0f2fe' strokeWidth='14' strokeLinecap='round' strokeLinejoin='round' />
       </g>
     ) : (
       <g>
         <path d='M -50 0 H 50 M 0 0 V 50' fill='none' stroke='#38a7d9' strokeWidth='30' strokeLinecap='round' strokeLinejoin='round' />
         <path d='M -46 0 H 46 M 0 0 V 46' fill='none' stroke='#e0f2fe' strokeWidth='14' strokeLinecap='round' strokeLinejoin='round' />
       </g>
     )}
  </g>);
}

export function GamePage() {
  const siteConfig = useSiteConfig();
  const { t } = useTranslation();
  return <main className='mx-auto flex w-full max-w-5xl flex-col gap-5 py-4'>
    <Helmet><title>{siteConfig.name} - {t("game")}</title></Helmet>
    <section><h1 className='text-3xl font-bold text-neutral-900 dark:text-white'>{t("game")}</h1><p className='mt-2 text-neutral-600 dark:text-neutral-300'>{t("game_description")}</p></section>
    <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
      <Link href='/game/water-fall' className='group rounded-2xl border border-black/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-theme/40 hover:shadow-md dark:border-white/10 dark:bg-dark'>
        <div className='flex items-start gap-4'><span className='flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-xs font-bold text-sky-700 dark:bg-sky-900/30 dark:text-sky-200'>🌊</span><div><h2 className='font-semibold text-neutral-900 group-hover:text-theme dark:text-white'>{t("water_fall_title")}</h2><p className='mt-1 text-sm leading-6 text-neutral-600 dark:text-neutral-300'>{t("water_fall_card_description")}</p><span className='mt-4 inline-flex text-sm font-medium text-theme'>{t("water_fall_play_now")}</span></div></div>
      </Link>
      <Link href='/game/penalty-kick' className='group rounded-2xl border border-black/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-theme/40 hover:shadow-md dark:border-white/10 dark:bg-dark'>
        <div className='flex items-start gap-4'><span className='flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'>⚽</span><div><h2 className='font-semibold text-neutral-900 group-hover:text-theme dark:text-white'>{t("penalty_kick_title", "Penalty Kick")}</h2><p className='mt-1 text-sm leading-6 text-neutral-600 dark:text-neutral-300'>{t("penalty_kick_card_description", "Swipe and hold to score a goal against the moving keeper!")}</p><span className='mt-4 inline-flex text-sm font-medium text-theme'>{t("water_fall_play_now", "Play Now")}</span></div></div>
      </Link>
      <Link href='/game/math-practice' className='group rounded-2xl border border-black/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-theme/40 hover:shadow-md dark:border-white/10 dark:bg-dark'>
        <div className='flex items-start gap-4'><span className='flex size-11 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-xs font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-200'>🧮</span><div><h2 className='font-semibold text-neutral-900 group-hover:text-theme dark:text-white'>{t("math_practice_title", "Math Practice")}</h2><p className='mt-1 text-sm leading-6 text-neutral-600 dark:text-neutral-300'>{t("math_practice_card_description", "Practice your mental math speed and accuracy with 10 questions!")}</p><span className='mt-4 inline-flex text-sm font-medium text-theme'>{t("water_fall_play_now", "Play Now")}</span></div></div>
      </Link>
    </div>
  </main>;
}

export function WaterFallGamePage() {
  const siteConfig = useSiteConfig();
  const { t } = useTranslation();
  const boardRef = useRef<SVGSVGElement>(null);
  const nextId = useRef(1);
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [pool, setPool] = useState<Point>(TARGET);
  const [barrier, setBarrier] = useState<Point[][]>([]);
  const [activeMode, setActiveMode] = useState<'draw' | 'eraser' | 'delete' | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [selected, setSelected] = useState<number>();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [water, setWater] = useState(0);
  const [running, setRunning] = useState(false);
  const [won, setWon] = useState(false);
  const flow = useMemo(() => getFlow(pipes), [pipes]);
  
  const drops = useMemo(() => {
    return flow.outlets.map(outlet => {
      let targetY = HEIGHT + 50;
      let inPool = false;
      if (outlet.x >= pool.x && outlet.x <= pool.x + POOL_SIZE.width && outlet.y < pool.y + 20 && pool.y - outlet.y < 320) {
        targetY = pool.y + 20;
        inPool = true;
      }
      for (const stroke of barrier) {
        for (let i = 1; i < stroke.length; i++) {
          const a = stroke[i - 1]; const b = stroke[i];
          const minX = Math.min(a.x, b.x); const maxX = Math.max(a.x, b.x);
          if (outlet.x >= minX && outlet.x <= maxX && minX !== maxX) {
            const y = a.y + (outlet.x - a.x) * (b.y - a.y) / (b.x - a.x);
            if (y >= outlet.y && y < targetY) {
              targetY = y;
              inPool = false;
            }
          }
        }
      }
      return { x: outlet.x, startY: outlet.y, endY: targetY, inPool };
    });
  }, [flow.outlets, barrier, pool]);

  const outletInPool = drops.some(d => d.inPool);
  const ready = flow.reachable.size >= 2 && flow.outlets.length > 0 && outletInPool;
  const toBoard = useCallback((clientX: number, clientY: number) => { const rect = boardRef.current?.getBoundingClientRect(); return rect ? { x: ((clientX - rect.left) / rect.width) * WIDTH, y: ((clientY - rect.top) / rect.height) * HEIGHT } : null; }, []);

  const [fish, setFish] = useState({ x: POOL_SIZE.width / 2, y: POOL_SIZE.height / 2, targetRotation: 0, rotation: 0, speed: 2 });

  useEffect(() => {
    let timer: number;
    if (!won) {
      timer = window.setInterval(() => {
        setFish(f => {
          let { x, y, targetRotation, rotation, speed } = f;
          
          if (Math.random() < 0.05) {
            targetRotation += (Math.random() - 0.5) * 120;
          }

          let diff = targetRotation - rotation;
          diff = ((diff + 540) % 360) - 180; 
          rotation += diff * 0.15; 

          const rad = rotation * Math.PI / 180;
          const vx = Math.cos(rad) * speed;
          const vy = Math.sin(rad) * speed;
          
          let nx = x + vx;
          let ny = y + vy;
          
          const waterTop = POOL_SIZE.height - 10 - (POOL_SIZE.height - 10) * water / 100;
          
          if (nx < 20 || nx > POOL_SIZE.width - 20) { 
            nx = x;
            targetRotation = 180 - targetRotation; 
          }
          if (ny < waterTop + 15 || ny > POOL_SIZE.height - 15) { 
            ny = y;
            targetRotation = -targetRotation; 
          }
          
          targetRotation = targetRotation % 360;

          return { x: nx, y: ny, targetRotation, rotation, speed };
        });
      }, 50);
    }
    return () => clearInterval(timer);
  }, [water, won]);

  useEffect(() => {
    if (!drag) return undefined;
    const move = (event: PointerEvent) => { const point = toBoard(event.clientX, event.clientY); if (!point) return; if (drag.type === 'pipe' && drag.id !== undefined) { setPipes((current) => current.map((pipe) => pipe.id === drag.id ? { ...pipe, x: point.x, y: point.y } : pipe)); setDrag((current) => current ? { ...current, point } : current); } else if (drag.type === 'pool') { const next = clampPool({ x: point.x - POOL_SIZE.width / 2, y: point.y - POOL_SIZE.height / 2 }); setPool(next); setDrag((current) => current ? { ...current, point: next } : current); } else setDrag((current) => current ? { ...current, point } : current); };
    const up = () => { if (drag.type === 'pipe') { const point = snap(drag.point); if (drag.id === undefined) setPipes((current) => [...current, { id: nextId.current++, type: drag.pipeType, x: point.x, y: point.y, rotation: drag.rotation }]); else setPipes((current) => current.map((pipe) => pipe.id === drag.id ? { ...pipe, x: point.x, y: point.y } : pipe)); } setDrag(() => null); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag, toBoard]);
  useEffect(() => {
    if (!drawing && !erasing) return undefined;
    const move = (event: PointerEvent) => { 
      const point = toBoard(event.clientX, event.clientY); 
      if (!point) return; 
      if (drawing) {
        setBarrier(current => {
          const newBarrier = [...current];
          if (newBarrier.length === 0) return newBarrier;
          const lastStroke = [...newBarrier[newBarrier.length - 1], point].slice(-100);
          newBarrier[newBarrier.length - 1] = lastStroke;
          return newBarrier;
        });
      } else if (erasing) {
        setBarrier(current => current.filter(stroke => !stroke.some(p => distance(p, point) < 20)));
      }
    };
    const up = () => { setDrawing(false); setErasing(false); }; 
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drawing, erasing, toBoard]);
  useEffect(() => { if (!running || won) return undefined; const timer = window.setInterval(() => setWater((level) => ready ? Math.min(100, level + 2) : Math.max(0, level - 0.5)), 100); return () => window.clearInterval(timer); }, [ready, running, won]);
  useEffect(() => { if (water >= 100) { setWon(true); setRunning(false); } }, [water]);

  const beginPipe = (event: ReactPointerEvent<SVGGElement | HTMLButtonElement>, type: PipeType, id?: number) => { 
    event.preventDefault(); event.stopPropagation(); 
    if (activeMode === 'delete' && id !== undefined) {
      setPipes(current => current.filter(p => p.id !== id));
      if (selected === id) setSelected(undefined);
      return;
    }
    setActiveMode(null); setSelected(id); 
    const point = toBoard(event.clientX, event.clientY); if (!point) return; 
    const pipe = pipes.find((item) => item.id === id); 
    setDrag({ type: 'pipe', pipeType: type, id, point, rotation: pipe?.rotation ?? 0 }); 
  };
  const beginPool = (event: ReactPointerEvent<SVGGElement>) => { event.preventDefault(); event.stopPropagation(); const point = toBoard(event.clientX, event.clientY); if (point) setDrag({ type: 'pool', point }); };
  const handleBoardPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => { 
    if (drag) return; 
    event.preventDefault(); 
    const point = toBoard(event.clientX, event.clientY); 
    if (!point) return; 
    
    if (activeMode === 'draw') { 
      setBarrier(current => [...current, [point]]); 
      setDrawing(true); 
    } else if (activeMode === 'eraser') {
      setErasing(true);
      setBarrier(current => current.filter(stroke => !stroke.some(p => distance(p, point) < 20)));
    }
  };
  const rotateSelected = (id?: number) => { const target = id !== undefined ? id : selected; if (target !== undefined) setPipes((current) => current.map((pipe) => pipe.id === target ? { ...pipe, rotation: (pipe.rotation + 90) % 360 } : pipe)); };
  const reset = () => { setPipes([]); setPool(TARGET); setBarrier([]); setWater(0); setRunning(false); setWon(false); setSelected(undefined); setActiveMode(null); nextId.current = 1; };
  const tasks = [{ done: flow.reachable.size >= 2 && flow.outlets.length > 0, text: t("water_fall_task_connect") }, { done: outletInPool, text: t("water_fall_task_pool") }];

  return <main className='mx-auto flex w-full max-w-7xl flex-col gap-5 py-4'>
    <Helmet><title>{siteConfig.name} - {t("water_fall_title")}</title></Helmet>
    <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'><section><Link href='/game' className='text-sm font-medium text-theme hover:underline'>{t("water_fall_all_games")}</Link><h1 className='mt-2 text-3xl font-bold text-neutral-900 dark:text-white'>{t("water_fall_title")}</h1><p className='mt-2 max-w-2xl text-neutral-600 dark:text-neutral-300'>{t("water_fall_description")}</p></section><div className='flex gap-2'><button type='button' onClick={reset} className='rounded-xl border border-black/10 px-4 py-2 text-sm dark:border-white/10'>{t("water_fall_reset")}</button><button type='button' onClick={() => setRunning((value) => !value)} className='rounded-xl bg-theme px-4 py-2 text-sm font-semibold text-white'>{running ? t('water_fall_pause') : t('water_fall_start') }</button></div></div>
    <div className='flex flex-col sm:flex-row gap-4 items-center justify-between rounded-2xl border border-black/10 bg-white px-5 py-4 dark:border-white/10 dark:bg-dark'>
      <ul className='flex flex-wrap gap-x-6 gap-y-2'>{tasks.map((task) => <li key={task.text} className='flex items-center gap-2 text-sm font-medium'><i className={`text-lg ${task.done ? 'ri-checkbox-circle-fill text-emerald-500' : 'ri-checkbox-blank-circle-line text-neutral-300'}`}></i><span className='text-neutral-700 dark:text-neutral-200'>{task.text}</span></li>)}</ul>
      <p className={`rounded-xl px-4 py-1.5 text-xs font-bold uppercase tracking-wider ${won ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' : ready ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300' : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'}`}>{won ? t('water_fall_won') : ready ? t('water_fall_ready') : t('water_fall_incomplete')}</p>
    </div>
    <div className='grid gap-4 md:grid-cols-[56px_minmax(0,1fr)_56px]'>
      <aside className='flex flex-row md:flex-col gap-2'>
        <button type='button' title={t("water_fall_straight")} onPointerDown={(event) => beginPipe(event, 'straight')} className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/50 dark:hover:bg-sky-900'><svg width="24" height="24" viewBox="-60 -60 120 120"><rect x='-50' y='-14' width='100' height='28' rx='14' fill='#e0f2fe' stroke='#38a7d9' strokeWidth='12' /></svg></button>
        <button type='button' title={t("water_fall_elbow")} onPointerDown={(event) => beginPipe(event, 'elbow')} className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/50 dark:hover:bg-sky-900'><svg width="24" height="24" viewBox="-60 -60 120 120"><path d='M 0 -50 V 0 H 50' fill='none' stroke='#38a7d9' strokeWidth='30' strokeLinecap='round' strokeLinejoin='round' /><path d='M 0 -46 V 0 H 46' fill='none' stroke='#e0f2fe' strokeWidth='14' strokeLinecap='round' strokeLinejoin='round' /></svg></button>
        <button type='button' title={t("water_fall_tee")} onPointerDown={(event) => beginPipe(event, 'tee')} className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/50 dark:hover:bg-sky-900'><svg width="24" height="24" viewBox="-60 -60 120 120"><path d='M -50 0 H 50 M 0 0 V 50' fill='none' stroke='#38a7d9' strokeWidth='30' strokeLinecap='round' strokeLinejoin='round' /><path d='M -46 0 H 46 M 0 0 V 46' fill='none' stroke='#e0f2fe' strokeWidth='14' strokeLinecap='round' strokeLinejoin='round' /></svg></button>
        <div className='my-1 hidden h-px w-full bg-black/10 dark:bg-white/10 md:block' />
        <button type='button' title={t("water_fall_draw_line")} onClick={() => { setActiveMode(activeMode === 'draw' ? null : 'draw'); setSelected(undefined); setDrag(null); }} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors ${activeMode === 'draw' ? 'border-orange-500 bg-orange-500 text-white shadow-sm' : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-900 dark:bg-orange-950/40 dark:hover:bg-orange-900'}`}><i className="ri-brush-line text-xl"></i></button>
      </aside>
      <section className='overflow-hidden rounded-3xl border border-sky-200 bg-sky-50 shadow-sm dark:border-sky-900/60 dark:bg-slate-950'><div className='flex items-center justify-between border-b border-sky-200 px-4 py-3 dark:border-sky-900/60'><span className='text-sm font-semibold text-sky-900 dark:text-sky-100'>{t("water_fall_playground")}</span><span className='text-xs font-medium text-sky-700 dark:text-sky-300'>{t("water_fall_full", { count: Math.round(water) })}</span></div><div className='overflow-x-auto p-2 sm:p-4'>
        <svg ref={boardRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className='mx-auto block w-full min-w-[300px] select-none rounded-2xl bg-gradient-to-b from-sky-100 to-white dark:from-slate-900 dark:to-slate-950' style={{ touchAction: activeMode !== null ? 'none' : 'auto' }} onPointerDown={handleBoardPointerDown}>
          <defs>
            <pattern id='game-grid' width='100' height='100' patternUnits='userSpaceOnUse'><path d='M 100 0 L 0 0 0 100' fill='none' stroke='#7dd3fc' strokeOpacity='0.16' /></pattern>
            <filter id="liquid"><feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" /><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="liquid" /><feComposite in="SourceGraphic" in2="liquid" operator="atop" /></filter>
          </defs>
          <rect width={WIDTH} height={HEIGHT} fill='url(#game-grid)' />
          
          <path d={`M ${SOURCE.x} 0 V ${SOURCE.y}`} stroke='#e0f2fe' strokeWidth='28' strokeLinecap='round' />{running ? <path d={`M ${SOURCE.x} 0 V ${SOURCE.y + 12}`} stroke='#bae6fd' strokeWidth='12' strokeLinecap='round' style={{ filter: 'url(#liquid)' }} className='waterfall-stream' /> : null}{running ? <path d={`M ${SOURCE.x} 0 V ${SOURCE.y + 12}`} stroke='#0ea5e9' strokeWidth='6' strokeLinecap='round' strokeDasharray='3 18' className='waterfall-stream' /> : null}<circle cx={SOURCE.x} cy={SOURCE.y} r='10' fill='#38bdf8' />
          {drops.map((drop, i) => <g key={`outlet-${i}`}><path d={`M ${drop.x} ${drop.startY} V ${drop.endY}`} stroke='#bae6fd' strokeWidth='12' strokeLinecap='round' style={{ filter: 'url(#liquid)' }} className={running && ready ? 'waterfall-stream' : undefined} /><path d={`M ${drop.x} ${drop.startY} V ${drop.endY}`} stroke='#0ea5e9' strokeWidth='6' strokeLinecap='round' strokeDasharray='3 18' className={running && ready ? 'waterfall-stream' : undefined} /></g>)}{pipes.map((pipe) => <PipeView key={pipe.id} pipe={pipe} selected={pipe.id === selected} onPointerDown={(event) => beginPipe(event, pipe.type, pipe.id)} onDoubleClick={() => rotateSelected(pipe.id)} />)}{pipes.filter((pipe) => running && flow.reachable.has(pipe.id)).map((pipe) => <FlowPath key={`flow-${pipe.id}`} pipe={pipe} />)}{drag?.type === 'pipe' && drag.id === undefined ? <PipeView pipe={{ id: -1, type: drag.pipeType, x: drag.point.x, y: drag.point.y, rotation: drag.rotation }} selected onPointerDown={() => undefined} /> : null}
          <g transform={`translate(${pool.x} ${pool.y})`} onPointerDown={beginPool} cursor='grab' style={{ touchAction: 'none' }}><rect width={POOL_SIZE.width} height={POOL_SIZE.height} rx='22' fill='#e0f2fe' stroke='#0284c7' strokeWidth='6' /><rect x='5' y={POOL_SIZE.height - 5 - (POOL_SIZE.height - 10) * water / 100} width={POOL_SIZE.width - 10} height={(POOL_SIZE.height - 10) * water / 100} rx='17' fill='#0284c7' /><g transform={`translate(${fish.x} ${fish.y}) rotate(${fish.rotation})`} className={won ? 'waterfall-fish-escape' : undefined}><text x={0} y={8} textAnchor='middle' fontSize='28' pointerEvents='none'>🐟</text></g><text x={POOL_SIZE.width / 2} y={POOL_SIZE.height - 12} textAnchor='middle' fill='#075985' fontSize='12' fontWeight='700'>{won ? t('water_fall_fish_escaped') : t('water_fall_drag_pool')}</text></g>
          {barrier.map((stroke, index) => stroke.length > 1 ? <polyline key={index} points={stroke.map((point) => `${point.x},${point.y}`).join(' ')} fill='none' stroke='#f97316' strokeWidth='12' strokeLinecap='round' strokeLinejoin='round' /> : null)}
        </svg></div></section>
      <aside className='flex flex-row md:flex-col gap-2'>
        <button type='button' title={t("water_fall_rotate")} onClick={() => rotateSelected()} disabled={selected === undefined} className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 dark:border-white/10 dark:bg-dark dark:text-neutral-300'><i className="ri-refresh-line text-xl"></i></button>
        <button type='button' title={t("water_fall_eraser")} onClick={() => { setActiveMode(activeMode === 'eraser' ? null : 'eraser'); setSelected(undefined); setDrag(null); }} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors ${activeMode === 'eraser' ? 'border-pink-500 bg-pink-500 text-white shadow-sm' : 'border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100 dark:border-pink-900 dark:bg-pink-950/40 dark:hover:bg-pink-900'}`}><i className="ri-eraser-line text-xl"></i></button>
        <button type='button' title={t("water_fall_delete")} onClick={() => { setActiveMode(activeMode === 'delete' ? null : 'delete'); setSelected(undefined); setDrag(null); }} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors ${activeMode === 'delete' ? 'border-red-500 bg-red-500 text-white shadow-sm' : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:hover:bg-red-900'}`}><i className="ri-delete-bin-line text-xl"></i></button>
        <div className='my-1 hidden h-px w-full bg-black/10 dark:bg-white/10 md:block' />
        <button type='button' title={t("water_fall_clear_line")} onClick={() => setBarrier([])} className='flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white text-neutral-500 hover:bg-neutral-50 hover:text-theme dark:border-white/10 dark:bg-dark dark:text-neutral-400'><i className="ri-delete-back-2-line text-xl"></i></button>
      </aside>
    </div><style>{`@keyframes waterfall-fish-escape { from { transform: translate(0, 0); opacity: 1; } to { transform: translate(180px, -170px); opacity: 0; } } @keyframes waterfall-stream { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -76; } } .waterfall-fish-escape { animation: waterfall-fish-escape 2.8s ease-out forwards; } .waterfall-stream { animation: waterfall-stream 0.8s linear infinite; }`}</style>
  </main>;
}
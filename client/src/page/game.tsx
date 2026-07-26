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
const DANGER_X = 700;
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

function stopsLeak(barrier: Point[][]) {
  for (const stroke of barrier) {
    for (let i = 1; i < stroke.length; i += 1) {
      const a = stroke[i - 1]; const b = stroke[i];
      if ((a.x - DANGER_X) * (b.x - DANGER_X) <= 0) {
        const y = Math.abs(b.x - a.x) < 1 ? a.y : a.y + ((DANGER_X - a.x) / (b.x - a.x)) * (b.y - a.y);
        if (y >= 90 && y <= 350) return true;
      }
    }
  }
  return false;
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
  return (<g transform={`translate(${pipe.x} ${pipe.y}) rotate(${pipe.rotation})`} onPointerDown={onPointerDown} onDoubleClick={onDoubleClick} cursor='grab'>
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
    <Link href='/game/water-fall' className='group rounded-2xl border border-black/10 bg-white p-5 transition hover:-translate-y-0.5 hover:border-theme/40 hover:shadow-md dark:border-white/10 dark:bg-dark'>
      <div className='flex items-start gap-4'><span className='flex size-11 items-center justify-center rounded-xl bg-sky-100 text-xs font-bold text-sky-700 dark:bg-sky-900/30 dark:text-sky-200'>{t("water_fall_drop")}</span><div><h2 className='font-semibold text-neutral-900 group-hover:text-theme dark:text-white'>{t("water_fall_title")}</h2><p className='mt-1 text-sm leading-6 text-neutral-600 dark:text-neutral-300'>{t("water_fall_card_description")}</p><span className='mt-4 inline-flex text-sm font-medium text-theme'>{t("water_fall_play_now")}</span></div></div>
    </Link>
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
  const poolTarget = distance({ x: pool.x + POOL_SIZE.width / 2, y: pool.y + POOL_SIZE.height / 2 }, { x: TARGET.x + POOL_SIZE.width / 2, y: TARGET.y + POOL_SIZE.height / 2 }) < 55;
  const outletInPool = Boolean(flow.outlets && flow.outlets.some(outlet => outlet.x >= pool.x && outlet.x <= pool.x + POOL_SIZE.width && outlet.y < pool.y + 20 && pool.y - outlet.y < 320));
  const ready = flow.reachable.size >= 2 && flow.outlets.length > 0 && poolTarget && outletInPool && stopsLeak(barrier);
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
  const tasks = [{ done: flow.reachable.size >= 2 && flow.outlets.length > 0, text: t("water_fall_task_connect") }, { done: stopsLeak(barrier), text: t("water_fall_task_line") }, { done: poolTarget && outletInPool, text: t("water_fall_task_pool") }];

  return <main className='mx-auto flex w-full max-w-7xl flex-col gap-5 py-4'>
    <Helmet><title>{siteConfig.name} - {t("water_fall_title")}</title></Helmet>
    <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'><section><Link href='/game' className='text-sm font-medium text-theme hover:underline'>{t("water_fall_all_games")}</Link><h1 className='mt-2 text-3xl font-bold text-neutral-900 dark:text-white'>{t("water_fall_title")}</h1><p className='mt-2 max-w-2xl text-neutral-600 dark:text-neutral-300'>{t("water_fall_description")}</p></section><div className='flex gap-2'><button type='button' onClick={reset} className='rounded-xl border border-black/10 px-4 py-2 text-sm dark:border-white/10'>{t("water_fall_reset")}</button><button type='button' onClick={() => setRunning((value) => !value)} className='rounded-xl bg-theme px-4 py-2 text-sm font-semibold text-white'>{running ? t('water_fall_pause') : t('water_fall_start') }</button></div></div>
    <div className='grid gap-5 xl:grid-cols-[160px_minmax(0,1fr)_160px]'>
      <aside className='flex flex-col gap-4'><section className='rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-dark'><h2 className='font-semibold text-neutral-900 dark:text-white'>{t("water_fall_tools")}</h2><p className='mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400'>{t("water_fall_tools_description")}</p><div className='mt-4 flex flex-col gap-2'><button type='button' onPointerDown={(event) => beginPipe(event, 'straight')} className='rounded-xl border border-sky-200 bg-sky-50 px-2 py-3 text-xs font-medium dark:border-sky-900 dark:bg-sky-950/50'>{t("water_fall_straight")}</button><button type='button' onPointerDown={(event) => beginPipe(event, 'elbow')} className='rounded-xl border border-sky-200 bg-sky-50 px-2 py-3 text-xs font-medium dark:border-sky-900 dark:bg-sky-950/50'>{t("water_fall_elbow")}</button><button type='button' onPointerDown={(event) => beginPipe(event, 'tee')} className='rounded-xl border border-sky-200 bg-sky-50 px-2 py-3 text-xs font-medium dark:border-sky-900 dark:bg-sky-950/50'>{t("water_fall_tee")}</button><button type='button' onClick={() => { setActiveMode(activeMode === 'draw' ? null : 'draw'); setSelected(undefined); setDrag(null); }} className={`rounded-xl px-2 py-3 text-xs font-semibold ${activeMode === 'draw' ? 'bg-orange-500 text-white shadow-sm' : 'border border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/40'}`}>{activeMode === 'draw' ? t('water_fall_drawing_on') : t('water_fall_draw_line')}</button></div><button type='button' onClick={() => rotateSelected()} disabled={selected === undefined} className='mt-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm disabled:opacity-40 dark:border-white/10'>{t("water_fall_rotate")}</button></section>
      </aside>
      <section className='overflow-hidden rounded-3xl border border-sky-200 bg-sky-50 shadow-sm dark:border-sky-900/60 dark:bg-slate-950'><div className='flex items-center justify-between border-b border-sky-200 px-4 py-3 dark:border-sky-900/60'><span className='text-sm font-semibold text-sky-900 dark:text-sky-100'>{t("water_fall_playground")}</span><span className='text-xs font-medium text-sky-700 dark:text-sky-300'>{t("water_fall_full", { count: Math.round(water) })}</span></div><div className='overflow-x-auto p-2 sm:p-4'>
        <svg ref={boardRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className='mx-auto block min-w-[760px] select-none rounded-2xl bg-gradient-to-b from-sky-100 to-white dark:from-slate-900 dark:to-slate-950' style={{ touchAction: 'none' }} onPointerDown={handleBoardPointerDown}>
          <defs>
            <pattern id='game-grid' width='100' height='100' patternUnits='userSpaceOnUse'><path d='M 100 0 L 0 0 0 100' fill='none' stroke='#7dd3fc' strokeOpacity='0.16' /></pattern>
            <filter id="liquid"><feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" /><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="liquid" /><feComposite in="SourceGraphic" in2="liquid" operator="atop" /></filter>
          </defs>
          <rect width={WIDTH} height={HEIGHT} fill='url(#game-grid)' />
          <rect x={TARGET.x} y={TARGET.y} width={POOL_SIZE.width} height={POOL_SIZE.height} rx='22' fill='#86efac' fillOpacity='0.12' stroke='#22c55e' strokeDasharray='8 8' strokeWidth='3' /><text x={TARGET.x} y={TARGET.y - 12} fill='#16a34a' fontSize='14' fontWeight='600'>{t("water_fall_pool_target")}</text>
          <path d={`M ${SOURCE.x} 0 V ${SOURCE.y}`} stroke='#e0f2fe' strokeWidth='28' strokeLinecap='round' />{running ? <path d={`M ${SOURCE.x} 0 V ${SOURCE.y + 12}`} stroke='#bae6fd' strokeWidth='12' strokeLinecap='round' style={{ filter: 'url(#liquid)' }} className='waterfall-stream' /> : null}{running ? <path d={`M ${SOURCE.x} 0 V ${SOURCE.y + 12}`} stroke='#0ea5e9' strokeWidth='6' strokeLinecap='round' strokeDasharray='3 18' className='waterfall-stream' /> : null}<circle cx={SOURCE.x} cy={SOURCE.y} r='10' fill='#38bdf8' /><path d={`M ${DANGER_X} 90 V ${stopsLeak(barrier) ? 230 : 350}`} stroke='#60a5fa' strokeWidth='10' strokeLinecap='round' strokeDasharray='2 22' />{stopsLeak(barrier) ? null : <text x={DANGER_X + 18} y='140' fill='#ef4444' fontSize='13' fontWeight='600'>{t("water_fall_draw_here")}</text>}
          {flow.outlets.map((outlet, i) => <g key={`outlet-${i}`}><path d={`M ${outlet.x} ${outlet.y} V ${Math.max(outlet.y + 30, pool.y)}`} stroke='#bae6fd' strokeWidth='12' strokeLinecap='round' style={{ filter: 'url(#liquid)' }} className={running && ready ? 'waterfall-stream' : undefined} /><path d={`M ${outlet.x} ${outlet.y} V ${Math.max(outlet.y + 30, pool.y)}`} stroke='#0ea5e9' strokeWidth='6' strokeLinecap='round' strokeDasharray='3 18' className={running && ready ? 'waterfall-stream' : undefined} /></g>)}{pipes.map((pipe) => <PipeView key={pipe.id} pipe={pipe} selected={pipe.id === selected} onPointerDown={(event) => beginPipe(event, pipe.type, pipe.id)} onDoubleClick={() => rotateSelected(pipe.id)} />)}{pipes.filter((pipe) => running && flow.reachable.has(pipe.id)).map((pipe) => <FlowPath key={`flow-${pipe.id}`} pipe={pipe} />)}{drag?.type === 'pipe' && drag.id === undefined ? <PipeView pipe={{ id: -1, type: drag.pipeType, x: drag.point.x, y: drag.point.y, rotation: drag.rotation }} selected onPointerDown={() => undefined} /> : null}
          <g transform={`translate(${pool.x} ${pool.y})`} onPointerDown={beginPool} cursor='grab'><rect width={POOL_SIZE.width} height={POOL_SIZE.height} rx='22' fill='#e0f2fe' stroke='#0284c7' strokeWidth='6' /><rect x='5' y={POOL_SIZE.height - 5 - (POOL_SIZE.height - 10) * water / 100} width={POOL_SIZE.width - 10} height={(POOL_SIZE.height - 10) * water / 100} rx='17' fill='#0284c7' /><g transform={`translate(${fish.x} ${fish.y}) rotate(${fish.rotation})`} className={won ? 'waterfall-fish-escape' : undefined}><text x={0} y={8} textAnchor='middle' fontSize='28' pointerEvents='none'>🐟</text></g><text x={POOL_SIZE.width / 2} y={POOL_SIZE.height - 12} textAnchor='middle' fill='#075985' fontSize='12' fontWeight='700'>{won ? t('water_fall_fish_escaped') : t('water_fall_drag_pool')}</text></g>
          {barrier.map((stroke, index) => stroke.length > 1 ? <polyline key={index} points={stroke.map((point) => `${point.x},${point.y}`).join(' ')} fill='none' stroke='#f97316' strokeWidth='12' strokeLinecap='round' strokeLinejoin='round' /> : null)}
        </svg></div></section>
      <aside className='flex flex-col gap-4'>
        <section className='rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-dark'><h2 className='font-semibold text-neutral-900 dark:text-white'>{t("water_fall_actions", "Actions")}</h2>
        <div className='mt-4 flex flex-col gap-2'>
          <button type='button' onClick={() => { setActiveMode(activeMode === 'eraser' ? null : 'eraser'); setSelected(undefined); setDrag(null); }} className={`rounded-xl px-2 py-3 text-xs font-semibold ${activeMode === 'eraser' ? 'bg-pink-500 text-white shadow-sm' : 'border border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900 dark:bg-pink-950/40'}`}>{t('water_fall_eraser', 'Eraser')}</button>
          <button type='button' onClick={() => { setActiveMode(activeMode === 'delete' ? null : 'delete'); setSelected(undefined); setDrag(null); }} className={`rounded-xl px-2 py-3 text-xs font-semibold ${activeMode === 'delete' ? 'bg-red-500 text-white shadow-sm' : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40'}`}>{t('water_fall_delete', 'Delete Pipe')}</button>
        </div>
        <button type='button' onClick={() => setBarrier([])} className='mt-4 w-full text-xs text-neutral-500 hover:text-theme'>{t("water_fall_clear_line")}</button>
        </section>
        <section className='rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-dark'><h2 className='font-semibold text-neutral-900 dark:text-white'>{t("water_fall_mission")}</h2><ul className='mt-3 space-y-3'>{tasks.map((task) => <li key={task.text} className='flex gap-2 text-sm'><span className={task.done ? 'text-emerald-500' : 'text-neutral-300'}>{task.done ? t('water_fall_done') : t('water_fall_todo')}</span><span>{task.text}</span></li>)}</ul><p className={`mt-4 rounded-xl px-3 py-2 text-xs leading-5 ${won ? 'bg-emerald-100 text-emerald-800' : ready ? 'bg-sky-100 text-sky-800' : 'bg-neutral-100 text-neutral-600'}`}>{won ? t('water_fall_won') : ready ? t('water_fall_ready') : t('water_fall_incomplete')}</p></section>
      </aside>
    </div><style>{`@keyframes waterfall-fish-escape { from { transform: translate(0, 0); opacity: 1; } to { transform: translate(180px, -170px); opacity: 0; } } @keyframes waterfall-stream { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -76; } } .waterfall-fish-escape { animation: waterfall-fish-escape 2.8s ease-out forwards; } .waterfall-stream { animation: waterfall-stream 0.8s linear infinite; }`}</style>
  </main>;
}
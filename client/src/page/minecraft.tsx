import { Canvas } from '@react-three/fiber';
import { World } from '../components/minecraft/World';
import { useStore, BlockType } from '../components/minecraft/store';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';

export function MinecraftGamePage() {
  const { t } = useTranslation();
  const { selectedBlockType, setSelectedBlockType, mode, setMode, resetWorld } = useStore();

  const blocks: { type: BlockType; color: string; name: string }[] = [
    { type: 'grass', color: '#4ade80', name: 'Grass' },
    { type: 'dirt', color: '#7c4c23', name: 'Dirt' },
    { type: 'wood', color: '#8b5a2b', name: 'Wood' },
    { type: 'glass', color: '#bae6fd', name: 'Glass' },
  ];

  return (
    <div className='flex h-[100dvh] w-full flex-col bg-slate-900 overflow-hidden relative'>
      {/* Header */}
      <header className='absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-slate-900/50 backdrop-blur-md pointer-events-auto'>
        <Link href="/game" className='flex items-center gap-2 text-white hover:text-sky-300 transition-colors'>
          <i className="ri-arrow-left-line text-xl"></i>
          <span className="font-semibold">{t('back', 'Back')}</span>
        </Link>
        <div className="flex gap-4 items-center">
          <button onClick={resetWorld} className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/40 transition-colors font-semibold text-sm">
            {t('minecraft_reset', 'Reset World')}
          </button>
        </div>
      </header>

      {/* 3D Canvas */}
      <div className="flex-1 w-full h-full relative cursor-crosshair touch-none">
        <Canvas shadows camera={{ position: [8, 6, 8], fov: 60 }}>
          <World />
        </Canvas>
      </div>

      {/* UI Overlay: Tools & Inventory */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-10 pointer-events-auto">
        
        {/* Mode Switcher */}
        <div className="flex gap-2 p-1 bg-slate-900/60 backdrop-blur-md rounded-xl border border-white/10 shadow-lg">
          <button 
            onClick={() => setMode('build')}
            className={`px-6 py-2 rounded-lg font-bold text-sm sm:text-base transition-colors ${mode === 'build' ? 'bg-theme text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            <i className="ri-hammer-line mr-2"></i>
            {t('minecraft_build', 'Build')}
          </button>
          <button 
            onClick={() => setMode('destroy')}
            className={`px-6 py-2 rounded-lg font-bold text-sm sm:text-base transition-colors ${mode === 'destroy' ? 'bg-rose-500 text-white' : 'text-neutral-400 hover:text-white'}`}
          >
            <i className="ri-delete-bin-line mr-2"></i>
            {t('minecraft_destroy', 'Destroy')}
          </button>
        </div>

        {/* Inventory Bar */}
        <div className={`flex gap-2 sm:gap-4 p-2 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-white/10 shadow-lg transition-opacity duration-300 ${mode === 'build' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          {blocks.map((block) => (
            <button
              key={block.type}
              onClick={() => setSelectedBlockType(block.type)}
              className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl border-4 transition-all flex flex-col items-center justify-center ${selectedBlockType === block.type ? 'border-white scale-110 shadow-xl' : 'border-transparent opacity-80 hover:opacity-100 hover:scale-105'}`}
              style={{ backgroundColor: block.color }}
              title={t(`minecraft_block_${block.type}`, block.name)}
            />
          ))}
        </div>

      </div>
    </div>
  );
}

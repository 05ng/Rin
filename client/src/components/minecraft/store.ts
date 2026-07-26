import { create } from 'zustand';

export type BlockType = 'dirt' | 'grass' | 'wood' | 'glass';

export interface BlockData {
  pos: [number, number, number];
  type: BlockType;
}

interface WorldState {
  blocks: BlockData[];
  selectedBlockType: BlockType;
  addBlock: (pos: [number, number, number], type: BlockType) => void;
  removeBlock: (pos: [number, number, number]) => void;
  setSelectedBlockType: (type: BlockType) => void;
  resetWorld: () => void;
  mode: 'build' | 'destroy';
  setMode: (mode: 'build' | 'destroy') => void;
}

const generateInitialGround = () => {
  const blocks: BlockData[] = [];
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      blocks.push({ pos: [x, 0, z], type: 'grass' });
    }
  }
  return blocks;
};

export const useStore = create<WorldState>((set) => ({
  blocks: generateInitialGround(),
  selectedBlockType: 'grass',
  mode: 'build',
  addBlock: (pos, type) =>
    set((state) => {
      if (state.blocks.find(b => b.pos[0] === pos[0] && b.pos[1] === pos[1] && b.pos[2] === pos[2])) {
        return state;
      }
      return { blocks: [...state.blocks, { pos, type }] };
    }),
  removeBlock: (pos) =>
    set((state) => ({
      blocks: state.blocks.filter(
        (b) => !(b.pos[0] === pos[0] && b.pos[1] === pos[1] && b.pos[2] === pos[2])
      ),
    })),
  setSelectedBlockType: (type) => set({ selectedBlockType: type }),
  resetWorld: () => set({ blocks: generateInitialGround() }),
  setMode: (mode) => set({ mode })
}));

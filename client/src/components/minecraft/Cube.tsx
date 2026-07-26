import { ThreeEvent } from '@react-three/fiber';
import { useStore, BlockData } from './store';
import { Edges } from '@react-three/drei';

export function Cube({ pos, type }: BlockData) {
  const { addBlock, removeBlock, selectedBlockType, mode } = useStore();

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    
    if (mode === 'destroy') {
      removeBlock(pos);
      return;
    }

    if (mode === 'build') {
      // Calculate normal to place block next to this one
      if (e.face) {
        const n = e.face.normal;
        const newPos: [number, number, number] = [
          pos[0] + Math.round(n.x),
          pos[1] + Math.round(n.y),
          pos[2] + Math.round(n.z)
        ];
        // Don't place below ground (y=0)
        if (newPos[1] >= 0) {
          addBlock(newPos, selectedBlockType);
        }
      }
    }
  };

  const dirtColor = '#7c4c23';
  const grassTopColor = '#4ade80';
  const woodColor = '#8b5a2b';
  const woodTopColor = '#d2b48c';
  const glassColor = '#bae6fd';

  return (
    <mesh position={pos} onPointerDown={handlePointerDown}>
      <boxGeometry args={[1, 1, 1]} />
      {type === 'dirt' && <meshStandardMaterial color={dirtColor} />}
      {type === 'grass' && (
        <>
          <meshStandardMaterial attach="material-0" color={dirtColor} />
          <meshStandardMaterial attach="material-1" color={dirtColor} />
          <meshStandardMaterial attach="material-2" color={grassTopColor} />
          <meshStandardMaterial attach="material-3" color={dirtColor} />
          <meshStandardMaterial attach="material-4" color={dirtColor} />
          <meshStandardMaterial attach="material-5" color={dirtColor} />
        </>
      )}
      {type === 'wood' && (
        <>
          <meshStandardMaterial attach="material-0" color={woodColor} />
          <meshStandardMaterial attach="material-1" color={woodColor} />
          <meshStandardMaterial attach="material-2" color={woodTopColor} />
          <meshStandardMaterial attach="material-3" color={woodTopColor} />
          <meshStandardMaterial attach="material-4" color={woodColor} />
          <meshStandardMaterial attach="material-5" color={woodColor} />
        </>
      )}
      {type === 'glass' && <meshStandardMaterial color={glassColor} transparent opacity={0.6} />}
      <Edges scale={1} threshold={15} color="rgba(0,0,0,0.2)" />
    </mesh>
  );
}

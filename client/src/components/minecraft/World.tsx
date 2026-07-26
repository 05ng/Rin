import { useStore } from './store';
import { Cube } from './Cube';
import { OrbitControls, Sky } from '@react-three/drei';

export function World() {
  const blocks = useStore((state) => state.blocks);

  return (
    <>
      <Sky sunPosition={[100, 20, 100]} />
      <ambientLight intensity={0.5} />
      <pointLight castShadow position={[100, 100, 100]} intensity={1} />
      
      {/* 
        maxPolarAngle prevents the camera from going below the ground.
        OrbitControls is perfect for "God Mode" on touch devices.
      */}
      <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.01} target={[0, 0, 0]} />

      <group>
        {blocks.map((block) => (
          <Cube key={block.pos.join(',')} pos={block.pos} type={block.type} />
        ))}
      </group>
    </>
  );
}

import { VaquitaMood } from '@/core-ui/types';
import { Eyes } from './Eyes';

interface HeadProps {
  baseColor: string;
  noseColor: string;
  spotColor: string;
  helmetColor: string;
  isCrying?: boolean;
  isHelmet?: boolean;
  isSleeping?: boolean;
  mood?: VaquitaMood;
}

const MOOD_BLUSH: Partial<Record<VaquitaMood, string>> = {
  excited: '#ffb347',
  loved: '#ff7099',
  sad: '#9bb3d0',
};

export const Head = ({
  baseColor,
  noseColor,
  spotColor,
  helmetColor,
  isCrying = false,
  isHelmet = true,
  isSleeping = false,
  mood = 'normal',
}: HeadProps) => {
  const blushColor = MOOD_BLUSH[mood] ?? '#f6b8a6';
  const showMouth = !isSleeping;

  return (
    <group position={[0, 1.15, 0]}>
      {/* Head */}
      <mesh castShadow>
        <boxGeometry args={[0.5, 0.6, 0.5]} />
        <meshStandardMaterial color={baseColor} />
      </mesh>
      {/* Eyes */}
      <Eyes isCrying={isCrying} isSleeping={isSleeping} mood={mood} />

      {/* Nose */}
      <group position={[0, -0.05, 0]}>
        <mesh position={[0, -0.1, 0.3]} castShadow>
          <boxGeometry args={[0.5, 0.22, 0.1]} />
          <meshStandardMaterial color={noseColor} />
        </mesh>

        <mesh position={[-0.12, -0.1, 0.35]} castShadow>
          <boxGeometry args={[0.05, 0.05, 0.01]} />
          <meshStandardMaterial color="black" />
        </mesh>

        <mesh position={[0.12, -0.1, 0.35]} castShadow>
          <boxGeometry args={[0.05, 0.05, 0.01]} />
          <meshStandardMaterial color="black" />
        </mesh>
      </group>

      {/* Mouth — varies by mood */}
      {showMouth && mood === 'excited' && (
        <group position={[0, -0.22, 0.36]}>
          {/* open laughing mouth */}
          <mesh position={[0, -0.02, 0]} castShadow>
            <boxGeometry args={[0.2, 0.1, 0]} />
            <meshStandardMaterial color="black" />
          </mesh>
          <mesh position={[0, -0.04, 0.001]} castShadow>
            <boxGeometry args={[0.14, 0.05, 0]} />
            <meshStandardMaterial color="#ff7796" />
          </mesh>
        </group>
      )}
      {showMouth && mood === 'loved' && (
        <group position={[0, -0.22, 0.36]}>
          <mesh position={[-0.06, 0, 0]} rotation={[0, 0, -0.5]} castShadow>
            <boxGeometry args={[0.1, 0.03, 0]} />
            <meshStandardMaterial color="black" />
          </mesh>
          <mesh position={[0.06, 0, 0]} rotation={[0, 0, 0.5]} castShadow>
            <boxGeometry args={[0.1, 0.03, 0]} />
            <meshStandardMaterial color="black" />
          </mesh>
        </group>
      )}
      {showMouth && mood === 'sad' && (
        <group position={[0, -0.22, 0.36]}>
          <mesh position={[-0.06, -0.04, 0]} rotation={[0, 0, 0.5]} castShadow>
            <boxGeometry args={[0.1, 0.03, 0]} />
            <meshStandardMaterial color="black" />
          </mesh>
          <mesh position={[0.06, -0.04, 0]} rotation={[0, 0, -0.5]} castShadow>
            <boxGeometry args={[0.1, 0.03, 0]} />
            <meshStandardMaterial color="black" />
          </mesh>
        </group>
      )}

      {/* Ears */}
      <mesh position={[-0.3, 0.12, 0]} castShadow>
        <boxGeometry args={[0.2, 0.15, 0.1]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>
      <mesh position={[0.3, 0.1, 0]} castShadow>
        <boxGeometry args={[0.2, 0.15, 0.1]} />
        <meshStandardMaterial color={spotColor} />
      </mesh>

      {/* Horns */}
      {!isHelmet && (
        <>
          <mesh position={[-0.15, 0.36, 0.05]} castShadow>
            <boxGeometry args={[0.1, 0.12, 0.1]} />
            <meshStandardMaterial color={noseColor} />
          </mesh>
          <mesh position={[-0.13, 0.46, 0.05]} castShadow>
            <boxGeometry args={[0.07, 0.07, 0.07]} />
            <meshStandardMaterial color={noseColor} />
          </mesh>
          <mesh position={[0.15, 0.36, 0.05]} castShadow>
            <boxGeometry args={[0.1, 0.12, 0.1]} />
            <meshStandardMaterial color={noseColor} />
          </mesh>
          <mesh position={[0.13, 0.46, 0.05]} castShadow>
            <boxGeometry args={[0.07, 0.07, 0.07]} />
            <meshStandardMaterial color={noseColor} />
          </mesh>

          {/* Forelock tuft */}
          <mesh position={[0, 0.34, 0.18]} castShadow>
            <boxGeometry args={[0.18, 0.1, 0.12]} />
            <meshStandardMaterial color={baseColor} />
          </mesh>
          <mesh position={[-0.05, 0.42, 0.16]} castShadow>
            <boxGeometry args={[0.07, 0.08, 0.08]} />
            <meshStandardMaterial color={baseColor} />
          </mesh>
          <mesh position={[0.05, 0.42, 0.16]} castShadow>
            <boxGeometry args={[0.07, 0.08, 0.08]} />
            <meshStandardMaterial color={baseColor} />
          </mesh>
        </>
      )}

      {/* Cheek blush */}
      <mesh position={[-0.22, -0.05, 0.26]} castShadow>
        <boxGeometry args={[0.08, 0.06, 0]} />
        <meshStandardMaterial color={blushColor} />
      </mesh>
      <mesh position={[0.22, -0.05, 0.26]} castShadow>
        <boxGeometry args={[0.08, 0.06, 0]} />
        <meshStandardMaterial color={blushColor} />
      </mesh>

      {/* Helmet */}
      {isHelmet && (
        <group position={[0, 0.15, 0]}>
          <mesh position={[0, 0.1, 0.07]} castShadow>
            <boxGeometry args={[0.55, 0.11, 0.65]} />
            <meshStandardMaterial color={helmetColor} />
          </mesh>

          <mesh position={[0, 0.2, 0.03]} castShadow>
            <boxGeometry args={[0.55, 0.25, 0.55]} />
            <meshStandardMaterial color={helmetColor} />
          </mesh>
        </group>
      )}
    </group>
  );
};

'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Componente que crea un skybox con degradado de cielo que muestra la dirección del sol
 */
const SkyBackground = () => {
  const skyboxMesh = useMemo(() => {
    const geometry = new THREE.SphereGeometry(500, 32, 32);
    
    // Posición del sol (misma que la luz direccional) - alejado más
    const sunPosition = new THREE.Vector3(3, 15, -15).normalize();
    
    const vertexShader = `
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform vec3 uSunDirection;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      
      void main() {
        vec3 pos = normalize(vWorldPosition);
        vec3 normal = normalize(vWorldNormal);
        
        // Calcular dirección hacia el sol
        float sunDot = dot(normal, uSunDirection);
        
        // Degradado base del cielo (azul muy fuerte y saturado)
        vec3 centerColor = vec3(0.2, 0.5, 1.0); // Azul muy fuerte y puro
        vec3 edgeColor = vec3(0.4, 0.7, 1.0);   // Azul cielo fuerte y saturado
        
        // Área del sol (más brillante y cálida)
        float sunInfluence = max(0.0, sunDot);
        vec3 sunColor = vec3(1.0, 0.95, 0.85); // Color cálido del sol
        sunInfluence = pow(sunInfluence, 8.0); // Hacer el área del sol más concentrada
        
        // Mezclar colores basado en la dirección del sol
        vec3 skyColor = mix(centerColor, edgeColor, (1.0 - sunDot) * 0.5);
        skyColor = mix(skyColor, sunColor, sunInfluence * 0.6);
        
        // Distancia desde el centro para viñeta
        float distFromCenter = length(vWorldPosition);
        float normalizedDist = distFromCenter / 500.0;
        float vignette = 1.0 - smoothstep(0.4, 1.0, normalizedDist);
        skyColor *= (0.8 + vignette * 0.2);
        
        gl_FragColor = vec4(skyColor, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uSunDirection: { value: sunPosition },
      },
      side: THREE.BackSide,
      fog: false,
    });

    return new THREE.Mesh(geometry, material);
  }, []);

  return <primitive object={skyboxMesh} />;
};

/**
 * Componente del sol visible con efecto de glow
 */
const Sun = () => {
  const sunPosition: [number, number, number] = [3, 15, -15];
  
  // Halo exterior del sol (más grande y difuso)
  const sunHaloOuter = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(12, 12);
    
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec2 vUv;
      
      void main() {
        vec2 center = vec2(0.5, 0.5);
        float dist = length(vUv - center);
        
        // Color cálido del sol
        vec3 sunColor = vec3(1.0, 0.95, 0.8);
        
        // Glow suave desde el centro
        float glow = 1.0 - smoothstep(0.0, 0.5, dist);
        glow = pow(glow, 2.0);
        
        gl_FragColor = vec4(sunColor, glow * 0.25);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    return new THREE.Mesh(geometry, material);
  }, []);

  // Halo medio del sol
  const sunHaloMiddle = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(6, 6);

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec2 vUv;
      
      void main() {
        vec2 center = vec2(0.5, 0.5);
        float dist = length(vUv - center);
        
        vec3 sunColor = vec3(1.0, 0.92, 0.75);
        float glow = 1.0 - smoothstep(0.0, 0.5, dist);
        glow = pow(glow, 1.5);
        
        gl_FragColor = vec4(sunColor, glow * 0.4);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    return new THREE.Mesh(geometry, material);
  }, []);

  // Núcleo del sol (brillante)
  const sunCore = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(3.5, 3.5);

    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      varying vec2 vUv;
      
      void main() {
        vec2 center = vec2(0.5, 0.5);
        float dist = length(vUv - center);
        
        // Color brillante del sol
        vec3 sunColor = vec3(1.0, 0.9, 0.7);
        
        // Forma circular suave
        float circle = 1.0 - smoothstep(0.0, 0.5, dist);
        
        // Brillo adicional en el centro
        float centerGlow = 1.0 - smoothstep(0.0, 0.2, dist);
        sunColor += vec3(0.2, 0.15, 0.1) * centerGlow;
        
        gl_FragColor = vec4(sunColor, circle * 0.75);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    return new THREE.Mesh(geometry, material);
  }, []);

  return (
    <Billboard position={sunPosition}>
      <primitive object={sunHaloOuter} renderOrder={-3} />
      <primitive object={sunHaloMiddle} renderOrder={-2} />
      <primitive object={sunCore} renderOrder={-1} />
    </Billboard>
  );
};

/**
 * Componente de una nube individual animada
 */
const AnimatedCloud = ({ 
  position, 
  scale = [1, 1, 1], 
  speed = 0.5,
  offset = 0 
}: { 
  position: [number, number, number]; 
  scale?: [number, number, number];
  speed?: number;
  offset?: number;
}) => {
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(offset);
  const basePosition = useRef(new THREE.Vector3(...position));

  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(scale[0], scale[1]);
  }, [scale]);

  const material = useMemo(() => {
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform vec2 uCloudCenter;
      varying vec2 vUv;
      
      // Noise function
      float noise(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }
      
      // Smooth noise
      float smoothNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        
        float a = noise(i);
        float b = noise(i + vec2(1.0, 0.0));
        float c = noise(i + vec2(0.0, 1.0));
        float d = noise(i + vec2(1.0, 1.0));
        
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      
      // FBM para crear formas de nubes
      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        for (int i = 0; i < 4; i++) {
          value += amplitude * smoothNoise(p * frequency);
          frequency *= 2.0;
          amplitude *= 0.5;
        }
        
        return value;
      }
      
      void main() {
        vec2 uv = vUv;
        vec2 center = uCloudCenter;
        
        // Crear forma de nube usando FBM con animación
        vec2 cloudPos = (uv - center) * 3.0 + vec2(uTime * 0.1, 0.0);
        float cloudShape = fbm(cloudPos);
        
        // Crear forma elíptica suave para la nube
        vec2 distFromCenter = uv - center;
        float radialDist = length(distFromCenter);
        float cloudMask = 1.0 - smoothstep(0.3, 0.8, radialDist);
        
        // Combinar forma procedural con máscara radial
        float finalCloud = cloudShape * cloudMask;
        finalCloud = smoothstep(0.3, 0.7, finalCloud);
        
        // Color de nube (blanco/gris claro)
        vec3 cloudColor = vec3(0.95, 0.95, 1.0);
        
        // Transparencia basada en la forma de la nube
        float alpha = finalCloud * 0.85;
        
        // Suavizar bordes
        alpha *= smoothstep(0.0, 0.2, finalCloud);
        
        gl_FragColor = vec4(cloudColor, alpha);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: offset },
        uCloudCenter: { value: new THREE.Vector2(0.5, 0.5) },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    
    // Guardar referencia del material
    materialRef.current = mat;
    
    return mat;
  }, [scale, offset]);

  useFrame((_, delta) => {
    if (materialRef.current) {
      timeRef.current += delta * speed;
      materialRef.current.uniforms.uTime.value = timeRef.current;
    }
    
    // Mover la nube suavemente en el espacio
    if (groupRef.current) {
      const moveSpeed = speed * 0.5; // Movimiento más lento que la animación
      const time = timeRef.current;
      
      // Movimiento circular suave alrededor de la posición base
      const radius = 2;
      groupRef.current.position.x = basePosition.current.x + Math.sin(time * moveSpeed) * radius;
      groupRef.current.position.z = basePosition.current.z + Math.cos(time * moveSpeed * 0.7) * radius;
      groupRef.current.position.y = basePosition.current.y + Math.sin(time * moveSpeed * 0.5) * 0.5;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <Billboard>
        <mesh geometry={geometry} material={material} renderOrder={-1} />
      </Billboard>
    </group>
  );
};

/**
 * Sistema de nubes animadas que rodean el mundito
 * Genera muchas nubes distribuidas en diferentes capas alrededor del terreno
 */
const CloudSystem = () => {
  const clouds = useMemo(() => {
    const cloudConfigs: Array<{
      pos: [number, number, number];
      scale: [number, number, number];
      speed: number;
      offset: number;
    }> = [];

    // Función auxiliar para generar nubes en un círculo
    const generateCloudsInCircle = (
      radius: number,
      yLevel: number,
      count: number,
      baseScale: [number, number, number],
      baseSpeed: number,
      startIndex: number
    ) => {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const scaleVariation = 0.7 + Math.random() * 0.6; // Variación de tamaño
        const speedVariation = baseSpeed * (0.7 + Math.random() * 0.6); // Variación de velocidad
        
        cloudConfigs.push({
          pos: [x, yLevel, z],
          scale: [
            baseScale[0] * scaleVariation,
            baseScale[1] * scaleVariation,
            baseScale[2]
          ] as [number, number, number],
          speed: speedVariation,
          offset: startIndex + i,
        });
      }
    };

    // Capa 1: Nubes muy cercanas al mundito (debajo)
    generateCloudsInCircle(25, -8, 8, [12, 7, 1], 0.35, 0);
    
    // Capa 2: Nubes cercanas alrededor del mundito
    generateCloudsInCircle(35, -10, 10, [15, 9, 1], 0.3, 8);
    
    // Capa 3: Nubes a media distancia
    generateCloudsInCircle(50, -12, 12, [18, 11, 1], 0.25, 18);
    
    // Capa 4: Nubes lejanas
    generateCloudsInCircle(70, -15, 14, [22, 13, 1], 0.2, 30);
    
    // Capa 5: Nubes muy lejanas
    generateCloudsInCircle(90, -18, 10, [25, 15, 1], 0.15, 44);
    
    // Nubes adicionales en diferentes alturas para más profundidad
    // Altura media-baja
    generateCloudsInCircle(40, -6, 8, [14, 8, 1], 0.32, 54);
    
    // Altura baja (más cerca del terreno)
    generateCloudsInCircle(30, -4, 6, [10, 6, 1], 0.4, 62);
    
    // Nubes dispersas adicionales para llenar espacios
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 30 + Math.random() * 60;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = -5 - Math.random() * 12;
      const scale = 8 + Math.random() * 12;
      
      cloudConfigs.push({
        pos: [x, y, z],
        scale: [scale, scale * 0.6, 1] as [number, number, number],
        speed: 0.2 + Math.random() * 0.3,
        offset: 68 + i,
      });
    }
    
    return cloudConfigs;
  }, []);

  return (
    <group>
      {clouds.map((cloud, index) => (
        <AnimatedCloud
          key={index}
          position={cloud.pos}
          scale={cloud.scale}
          speed={cloud.speed}
          offset={cloud.offset}
        />
      ))}
    </group>
  );
};

/**
 * Componente principal que combina el cielo, el sol y las nubes
 */
export const CloudSkybox = () => {
  return (
    <>
      <SkyBackground />
      <Sun />
      <CloudSystem />
    </>
  );
};

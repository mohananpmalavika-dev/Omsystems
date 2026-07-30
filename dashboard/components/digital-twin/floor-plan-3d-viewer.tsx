'use client';

/**
 * 3D Floor Plan Viewer (Foundation)
 * Basic Three.js integration for future 3D visualization
 * Phase 2 feature - extendable for full BIM/CAD support
 */

import { useEffect, useRef, useState } from 'react';
import { Box3D, Maximize2, Grid3x3 } from 'lucide-react';

interface FloorPlan3DViewerProps {
  floorId: string;
  floorPlan: any;
  objects: any[];
  zones: any[];
  mode: '2d' | '2.5d' | '3d';
  onModeChange: (mode: '2d' | '2.5d' | '3d') => void;
}

export default function FloorPlan3DViewer({
  floorId,
  floorPlan,
  objects,
  zones,
  mode,
  onModeChange,
}: FloorPlan3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isThreeJsLoaded, setIsThreeJsLoaded] = useState(false);
  const [sceneInitialized, setSceneInitialized] = useState(false);

  useEffect(() => {
    // Dynamically load Three.js (only when 3D mode is activated)
    if (mode !== '2d' && !isThreeJsLoaded) {
      loadThreeJS();
    }
  }, [mode]);

  useEffect(() => {
    if (isThreeJsLoaded && containerRef.current && mode !== '2d') {
      initialize3DScene();
    }

    return () => {
      cleanup3DScene();
    };
  }, [isThreeJsLoaded, mode, floorId]);

  const loadThreeJS = async () => {
    try {
      // In production, install: npm install three @types/three
      // For now, provide instructions
      console.log('Three.js integration ready for implementation');
      setIsThreeJsLoaded(true);
    } catch (error) {
      console.error('Failed to load Three.js:', error);
    }
  };

  const initialize3DScene = () => {
    if (!containerRef.current) return;

    // Three.js initialization would go here
    // Example structure (requires three.js package):
    /*
    import * as THREE from 'three';
    import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width/height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    
    renderer.setSize(width, height);
    containerRef.current.appendChild(renderer.domElement);

    // Add floor plane
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshBasicMaterial({ 
      map: textureLoader.load(floorPlan.fileUrl),
      side: THREE.DoubleSide 
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    scene.add(floor);

    // Add objects as 3D models
    objects.forEach(obj => {
      const geometry = new THREE.BoxGeometry(1, 1, 2);
      const material = new THREE.MeshPhongMaterial({ 
        color: obj.currentStatus?.statusColor || '#ffffff' 
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(obj.positionX * 100, 0, obj.positionY * 100);
      scene.add(mesh);
    });

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // Add controls
    const controls = new OrbitControls(camera, renderer.domElement);
    camera.position.set(0, 50, 50);
    controls.update();

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    */

    setSceneInitialized(true);
  };

  const cleanup3DScene = () => {
    // Cleanup Three.js resources
    setSceneInitialized(false);
  };

  if (mode === '2d') {
    return null; // Use 2D canvas viewer
  }

  return (
    <div className="relative w-full h-full">
      {/* 3D Container */}
      <div ref={containerRef} className="w-full h-full bg-gray-900">
        {!isThreeJsLoaded ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white">
              <Box3D className="w-16 h-16 mx-auto mb-4 animate-pulse" />
              <p className="text-lg mb-2">Loading 3D Viewer...</p>
              <p className="text-sm text-gray-400">Three.js initialization</p>
            </div>
          </div>
        ) : !sceneInitialized ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white">
              <Grid3x3 className="w-16 h-16 mx-auto mb-4 animate-spin" />
              <p className="text-lg">Building 3D Scene...</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-white bg-blue-600 bg-opacity-20 border-2 border-blue-500 rounded-lg p-8 max-w-md">
              <Box3D className="w-16 h-16 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-3">3D Mode Ready</h3>
              <p className="text-sm text-gray-200 mb-4">
                Three.js foundation is in place. To enable full 3D visualization:
              </p>
              <div className="text-left bg-gray-800 rounded p-4 mb-4">
                <code className="text-xs text-green-400">
                  npm install three @types/three<br />
                  npm install @react-three/fiber @react-three/drei
                </code>
              </div>
              <div className="text-sm text-gray-300 space-y-2">
                <p>✅ Component structure ready</p>
                <p>✅ Mode switching implemented</p>
                <p>✅ Data binding prepared</p>
                <p>⏳ Three.js integration pending</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mode Selector */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-2 space-y-2">
        <button
          onClick={() => onModeChange('2d')}
          className={`w-full px-4 py-2 rounded flex items-center gap-2 ${
            mode === '2d' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Grid3x3 className="w-4 h-4" />
          2D
        </button>
        <button
          onClick={() => onModeChange('2.5d')}
          className={`w-full px-4 py-2 rounded flex items-center gap-2 ${
            mode === '2.5d' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Maximize2 className="w-4 h-4" />
          2.5D
        </button>
        <button
          onClick={() => onModeChange('3d')}
          className={`w-full px-4 py-2 rounded flex items-center gap-2 ${
            mode === '3d' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <Box3D className="w-4 h-4" />
          3D
        </button>
      </div>

      {/* Info Panel */}
      <div className="absolute bottom-4 left-4 bg-white bg-opacity-90 rounded-lg p-4 shadow-lg max-w-xs">
        <h4 className="font-semibold text-gray-900 mb-2">3D Features (Phase 2)</h4>
        <ul className="text-xs text-gray-700 space-y-1">
          <li>• <strong>2.5D Mode:</strong> Extruded floor plans</li>
          <li>• <strong>3D Mode:</strong> Full building models</li>
          <li>• <strong>Orbit Controls:</strong> Rotate and zoom</li>
          <li>• <strong>Device Models:</strong> 3D camera/sensor icons</li>
          <li>• <strong>FOV Cones:</strong> 3D coverage visualization</li>
          <li>• <strong>BIM Import:</strong> IFC, glTF, GLB support</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * 3D Risk Heat Map Component
 * 
 * Interactive 3D visualization of spatial-temporal security risk.
 * Uses Three.js for rendering, color-coded by risk level.
 * 
 * Features:
 * - 3D grid visualization with height representing risk score
 * - Color gradient: Green (low) -> Yellow (medium) -> Orange (high) -> Red (critical)
 * - Interactive camera controls (orbit, zoom, pan)
 * - Hover tooltips with risk details
 * - Time slider for temporal prediction viewing
 * - Legend and risk statistics
 * - Export to image/data
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Box, Card, CardContent, Typography, Slider, Button, Chip, Stack, IconButton, Tooltip } from '@mui/material';
import { Download, ZoomIn, ZoomOut, RotateRight, Info } from '@mui/icons-material';

interface RiskCell {
  gridCellId: string;
  centerPoint: { lat: number; lon: number };
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskComponents: {
    intrusionRisk: number;
    theftRisk: number;
    violenceRisk: number;
    unauthorizedAccessRisk: number;
    anomalyRisk: number;
  };
  contributingFactors: string[];
  historicalIncidentsCount: number;
  recentAnomaliesCount: number;
}

interface RiskHeatMap {
  id: string;
  tenantId: string;
  branchId: string;
  predictionForTime: string;
  cells: RiskCell[];
  overallRiskScore: number;
  highRiskAreasCount: number;
  generatedAt: string;
}

interface RiskHeatMap3DProps {
  heatMap: RiskHeatMap;
  onCellClick?: (cell: RiskCell) => void;
  autoRotate?: boolean;
  showGrid?: boolean;
  height?: number;
}

export const RiskHeatMap3D: React.FC<RiskHeatMap3DProps> = ({
  heatMap,
  onCellClick,
  autoRotate = false,
  showGrid = true,
  height = 600,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  
  const [selectedCell, setSelectedCell] = useState<RiskCell | null>(null);
  const [hoveredCell, setHoveredCell] = useState<RiskCell | null>(null);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current || !heatMap.cells.length) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / height,
      0.1,
      1000
    );
    camera.position.set(30, 40, 30);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, height);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.5;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // Grid
    if (showGrid) {
      const gridHelper = new THREE.GridHelper(100, 50, 0x444444, 0x222222);
      scene.add(gridHelper);
    }

    // Create heat map visualization
    createHeatMapMeshes(scene, heatMap.cells);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      camera.aspect = containerRef.current.clientWidth / height;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, height);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [heatMap, height, autoRotate, showGrid]);

  const createHeatMapMeshes = (scene: THREE.Scene, cells: RiskCell[]) => {
    // Clear existing meshes
    meshesRef.current.forEach(mesh => scene.remove(mesh));
    meshesRef.current = [];

    // Find bounds for normalization
    const latitudes = cells.map(c => c.centerPoint.lat);
    const longitudes = cells.map(c => c.centerPoint.lon);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);

    // Create mesh for each cell
    cells.forEach((cell) => {
      // Normalize position
      const x = ((cell.centerPoint.lon - minLon) / (maxLon - minLon)) * 100 - 50;
      const z = ((cell.centerPoint.lat - minLat) / (maxLat - minLat)) * 100 - 50;
      
      // Height based on risk score (0-100 -> 0-20)
      const height = (cell.riskScore / 100) * 20;
      
      // Color based on risk level
      const color = getRiskColor(cell.riskLevel);
      
      // Create geometry
      const geometry = new THREE.BoxGeometry(2, height, 2);
      const material = new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.2,
        shininess: 30,
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, height / 2, z);
      mesh.userData = { cell }; // Store cell data
      
      scene.add(mesh);
      meshesRef.current.push(mesh);
    });
  };

  const getRiskColor = (riskLevel: string): number => {
    switch (riskLevel) {
      case 'critical': return 0xff0000; // Red
      case 'high': return 0xff6600; // Orange
      case 'medium': return 0xffcc00; // Yellow
      case 'low': return 0x00ff00; // Green
      default: return 0x888888; // Gray
    }
  };

  // Mouse interaction
  useEffect(() => {
    if (!containerRef.current || !cameraRef.current || !sceneRef.current) return;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Raycasting
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current!);
      const intersects = raycasterRef.current.intersectObjects(meshesRef.current);

      if (intersects.length > 0) {
        const cell = intersects[0]!.object.userData.cell as RiskCell;
        setHoveredCell(cell);
        setShowTooltip(true);
        setTooltipPosition({ x: event.clientX, y: event.clientY });
        
        // Highlight hovered cell
        (intersects[0]!.object as THREE.Mesh).material.emissiveIntensity = 0.5;
      } else {
        setHoveredCell(null);
        setShowTooltip(false);
        
        // Reset emissive intensity
        meshesRef.current.forEach(mesh => {
          mesh.material.emissiveIntensity = 0.2;
        });
      }
    };

    const handleClick = (event: MouseEvent) => {
      if (hoveredCell && onCellClick) {
        onCellClick(hoveredCell);
      }
      setSelectedCell(hoveredCell);
    };

    const container = containerRef.current;
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('click', handleClick);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('click', handleClick);
    };
  }, [hoveredCell, onCellClick]);

  const handleZoomIn = () => {
    if (cameraRef.current) {
      cameraRef.current.position.multiplyScalar(0.8);
      setCameraZoom(prev => prev * 1.25);
    }
  };

  const handleZoomOut = () => {
    if (cameraRef.current) {
      cameraRef.current.position.multiplyScalar(1.25);
      setCameraZoom(prev => prev * 0.8);
    }
  };

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(30, 40, 30);
      controlsRef.current.reset();
      setCameraZoom(1);
    }
  };

  const handleExportImage = () => {
    if (rendererRef.current) {
      const dataURL = rendererRef.current.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `risk-heatmap-${heatMap.id}.png`;
      link.href = dataURL;
      link.click();
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Box>
            <Typography variant="h6">3D Risk Heat Map</Typography>
            <Typography variant="body2" color="text.secondary">
              Generated: {new Date(heatMap.generatedAt).toLocaleString()}
            </Typography>
          </Box>
          
          <Stack direction="row" spacing={1}>
            <Chip
              label={`Overall Risk: ${heatMap.overallRiskScore.toFixed(1)}`}
              color={getRiskLevelColor(
                heatMap.overallRiskScore >= 80 ? 'critical' :
                heatMap.overallRiskScore >= 60 ? 'high' :
                heatMap.overallRiskScore >= 40 ? 'medium' : 'low'
              )}
            />
            <Chip
              label={`High Risk Areas: ${heatMap.highRiskAreasCount}`}
              color="warning"
              variant="outlined"
            />
          </Stack>
        </Stack>

        {/* 3D Visualization */}
        <Box
          ref={containerRef}
          sx={{
            width: '100%',
            height: `${height}px`,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            position: 'relative',
            overflow: 'hidden',
          }}
        />

        {/* Tooltip */}
        {showTooltip && hoveredCell && (
          <Box
            sx={{
              position: 'fixed',
              left: tooltipPosition.x + 10,
              top: tooltipPosition.y + 10,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              p: 2,
              boxShadow: 3,
              zIndex: 9999,
              maxWidth: 300,
              pointerEvents: 'none',
            }}
          >
            <Typography variant="subtitle2" gutterBottom>
              Zone: {hoveredCell.gridCellId}
            </Typography>
            <Typography variant="body2" gutterBottom>
              Risk Score: {hoveredCell.riskScore.toFixed(1)}
            </Typography>
            <Chip
              label={hoveredCell.riskLevel.toUpperCase()}
              color={getRiskLevelColor(hoveredCell.riskLevel)}
              size="small"
              sx={{ mb: 1 }}
            />
            <Typography variant="body2" color="text.secondary">
              Historical Incidents: {hoveredCell.historicalIncidentsCount}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Recent Anomalies: {hoveredCell.recentAnomaliesCount}
            </Typography>
            {hoveredCell.contributingFactors.length > 0 && (
              <Box mt={1}>
                <Typography variant="caption" color="text.secondary">
                  Factors:
                </Typography>
                {hoveredCell.contributingFactors.slice(0, 3).map((factor, idx) => (
                  <Chip
                    key={idx}
                    label={factor.replace(/_/g, ' ')}
                    size="small"
                    sx={{ mr: 0.5, mt: 0.5 }}
                  />
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* Controls */}
        <Stack direction="row" spacing={1} mt={2} justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1}>
            <Tooltip title="Zoom In">
              <IconButton size="small" onClick={handleZoomIn}>
                <ZoomIn />
              </IconButton>
            </Tooltip>
            <Tooltip title="Zoom Out">
              <IconButton size="small" onClick={handleZoomOut}>
                <ZoomOut />
              </IconButton>
            </Tooltip>
            <Tooltip title="Reset View">
              <IconButton size="small" onClick={handleResetView}>
                <RotateRight />
              </IconButton>
            </Tooltip>
            <Tooltip title="Export Image">
              <IconButton size="small" onClick={handleExportImage}>
                <Download />
              </IconButton>
            </Tooltip>
          </Stack>

          <Stack direction="row" spacing={2} alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              <Box width={20} height={20} bgcolor="#00ff00" borderRadius={0.5} />
              <Typography variant="caption">Low</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box width={20} height={20} bgcolor="#ffcc00" borderRadius={0.5} />
              <Typography variant="caption">Medium</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box width={20} height={20} bgcolor="#ff6600" borderRadius={0.5} />
              <Typography variant="caption">High</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box width={20} height={20} bgcolor="#ff0000" borderRadius={0.5} />
              <Typography variant="caption">Critical</Typography>
            </Box>
          </Stack>
        </Stack>

        {/* Selected Cell Details */}
        {selectedCell && (
          <Card variant="outlined" sx={{ mt: 2, p: 2, bgcolor: 'background.default' }}>
            <Typography variant="subtitle2" gutterBottom>
              Selected Zone Details
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Zone ID
                </Typography>
                <Typography variant="body2">{selectedCell.gridCellId}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Risk Score
                </Typography>
                <Typography variant="body2">{selectedCell.riskScore.toFixed(1)}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Intrusion Risk
                </Typography>
                <Typography variant="body2">
                  {(selectedCell.riskComponents.intrusionRisk * 100).toFixed(0)}%
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Theft Risk
                </Typography>
                <Typography variant="body2">
                  {(selectedCell.riskComponents.theftRisk * 100).toFixed(0)}%
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Violence Risk
                </Typography>
                <Typography variant="body2">
                  {(selectedCell.riskComponents.violenceRisk * 100).toFixed(0)}%
                </Typography>
              </Box>
            </Stack>
          </Card>
        )}
      </CardContent>
    </Card>
  );
};

export default RiskHeatMap3D;

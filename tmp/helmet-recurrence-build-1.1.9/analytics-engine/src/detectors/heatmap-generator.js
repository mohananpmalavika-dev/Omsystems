/**
 * Heat Map Generator
 * Generates traffic flow heat maps for movement pattern analysis
 */
import { BaseDetector } from "./base-detector.js";
import { objectTracker } from "../tracking/object-tracker.js";
export class HeatMapGenerator extends BaseDetector {
    config;
    heatMap = [];
    movementVectors = [];
    lastDecayTime = new Date();
    decayTimer;
    DEFAULT_CONFIG = {
        gridWidth: 32,
        gridHeight: 18,
        decayRate: 0.05, // 5% decay per minute
        updateInterval: 60, // 1 minute
    };
    constructor(config) {
        super("heatmap", "1.0.0");
        this.config = { ...this.DEFAULT_CONFIG, ...config };
        this.initializeGrid();
    }
    async initialize() {
        console.log("Initializing heat map generator...");
        this.initializeGrid();
        this.startDecayProcess();
        console.log("Heat map generator initialized");
    }
    /**
     * Initialize the heat map grid
     */
    initializeGrid() {
        this.heatMap = [];
        for (let y = 0; y < this.config.gridHeight; y++) {
            const row = [];
            for (let x = 0; x < this.config.gridWidth; x++) {
                row.push({
                    x,
                    y,
                    intensity: 0,
                    count: 0,
                    lastUpdate: new Date(),
                });
            }
            this.heatMap.push(row);
        }
    }
    async detect(frame) {
        // Get tracked objects (persons, vehicles)
        const trackedObjects = await this.getTrackedObjects(frame);
        // Update heat map
        this.updateHeatMap(trackedObjects, frame.timestamp);
        // Analyze traffic flow
        const flowPatterns = this.analyzeTrafficFlow();
        const results = [];
        // Generate heat map snapshot
        results.push({
            detectionType: "heatmap",
            confidence: 1.0,
            objects: [],
            metadata: {
                grid: this.serializeHeatMap(),
                hotspots: this.identifyHotspots(),
                gridSize: {
                    width: this.config.gridWidth,
                    height: this.config.gridHeight,
                },
                timestamp: frame.timestamp.toISOString(),
            },
            requiresAlert: false,
        });
        // Generate flow analysis
        if (flowPatterns.length > 0) {
            results.push({
                detectionType: "traffic-flow",
                confidence: 0.95,
                objects: [],
                metadata: {
                    flows: flowPatterns,
                    dominantDirections: this.getDominantDirections(flowPatterns),
                    congestionPoints: this.identifyBottlenecks(),
                },
                requiresAlert: false,
            });
        }
        return results;
    }
    /**
     * Get tracked objects from frame
     */
    async getTrackedObjects(frame) {
        const activeTracks = objectTracker.getActiveTracks(frame.cameraId);
        return activeTracks.map((track) => {
            const latest = track.trajectory[track.trajectory.length - 1];
            const previous = track.trajectory.length > 1 ? track.trajectory[track.trajectory.length - 2] : undefined;
            return {
                trackId: track.trackId,
                objectType: track.objectClass,
                boundingBox: latest?.bbox || { x: 0, y: 0, width: 0.1, height: 0.1 },
                previousPosition: previous ? { x: previous.x, y: previous.y } : undefined,
            };
        });
    }
    /**
     * Update heat map with new detections
     */
    updateHeatMap(objects, timestamp) {
        for (const obj of objects) {
            // Convert bounding box center to grid coordinates
            const centerX = obj.boundingBox.x + obj.boundingBox.width / 2;
            const centerY = obj.boundingBox.y + obj.boundingBox.height / 2;
            const gridX = Math.floor(centerX * this.config.gridWidth);
            const gridY = Math.floor(centerY * this.config.gridHeight);
            if (this.isValidCell(gridX, gridY)) {
                const cell = this.heatMap[gridY][gridX];
                cell.count++;
                cell.intensity = Math.min(1.0, cell.intensity + 0.1);
                cell.lastUpdate = timestamp;
                // Record movement vector if object has previous position
                if (obj.previousPosition) {
                    this.recordMovement(obj.previousPosition, { x: centerX, y: centerY }, timestamp);
                }
            }
        }
    }
    /**
     * Record movement vector
     */
    recordMovement(from, to, timestamp) {
        this.movementVectors.push({ from, to, timestamp });
        // Keep only recent movements (last 5 minutes)
        const cutoff = timestamp.getTime() - 300000;
        this.movementVectors = this.movementVectors.filter(v => v.timestamp.getTime() > cutoff);
    }
    /**
     * Analyze traffic flow patterns
     */
    analyzeTrafficFlow() {
        if (this.movementVectors.length < 10)
            return [];
        const flows = new Map();
        for (const vector of this.movementVectors) {
            const fromGridX = Math.floor(vector.from.x * this.config.gridWidth);
            const fromGridY = Math.floor(vector.from.y * this.config.gridHeight);
            const toGridX = Math.floor(vector.to.x * this.config.gridWidth);
            const toGridY = Math.floor(vector.to.y * this.config.gridHeight);
            const key = `${fromGridX},${fromGridY}-${toGridX},${toGridY}`;
            if (!flows.has(key)) {
                flows.set(key, {
                    from: { x: fromGridX, y: fromGridY },
                    to: { x: toGridX, y: toGridY },
                    count: 0,
                    averageSpeed: 0,
                    dominantDirection: this.calculateDirection(vector.from, vector.to),
                });
            }
            const flow = flows.get(key);
            flow.count++;
        }
        // Filter out low-frequency flows
        return Array.from(flows.values())
            .filter(f => f.count >= 5)
            .sort((a, b) => b.count - a.count)
            .slice(0, 50); // Top 50 flows
    }
    /**
     * Calculate direction from movement
     */
    calculateDirection(from, to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01)
            return "none";
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle >= -45 && angle < 45)
            return "east";
        if (angle >= 45 && angle < 135)
            return "south";
        if (angle >= 135 || angle < -135)
            return "west";
        return "north";
    }
    /**
     * Start heat decay process
     */
    startDecayProcess() {
        if (this.decayTimer)
            return;
        this.decayTimer = setInterval(() => {
            const now = new Date();
            const timeDiff = (now.getTime() - this.lastDecayTime.getTime()) / 60000; // Minutes
            for (const row of this.heatMap) {
                for (const cell of row) {
                    // Apply exponential decay
                    cell.intensity *= Math.pow(1 - this.config.decayRate, timeDiff);
                    // Reset to 0 if very low
                    if (cell.intensity < 0.01) {
                        cell.intensity = 0;
                    }
                }
            }
            this.lastDecayTime = now;
        }, 60000); // Every minute
    }
    /**
     * Serialize heat map for transmission
     */
    serializeHeatMap() {
        return this.heatMap.map(row => row.map(cell => Math.round(cell.intensity * 255)));
    }
    /**
     * Identify hot spots
     */
    identifyHotspots() {
        const hotspots = [];
        for (const row of this.heatMap) {
            for (const cell of row) {
                if (cell.intensity > 0.7) {
                    hotspots.push({
                        x: cell.x,
                        y: cell.y,
                        intensity: cell.intensity,
                    });
                }
            }
        }
        return hotspots.sort((a, b) => b.intensity - a.intensity).slice(0, 10);
    }
    /**
     * Get dominant movement directions
     */
    getDominantDirections(flows) {
        const directions = {
            north: 0,
            south: 0,
            east: 0,
            west: 0,
        };
        for (const flow of flows) {
            if (flow.dominantDirection !== "none") {
                directions[flow.dominantDirection] += flow.count;
            }
        }
        return directions;
    }
    /**
     * Identify bottlenecks
     */
    identifyBottlenecks() {
        const bottlenecks = [];
        // Find cells with high intensity and low movement
        for (let y = 0; y < this.config.gridHeight; y++) {
            for (let x = 0; x < this.config.gridWidth; x++) {
                const cell = this.heatMap[y][x];
                if (cell.intensity > 0.6) {
                    // Check surrounding cells for flow
                    const hasFlow = this.hasOutgoingFlow(x, y);
                    if (!hasFlow) {
                        bottlenecks.push({
                            x,
                            y,
                            severity: cell.intensity,
                        });
                    }
                }
            }
        }
        return bottlenecks.slice(0, 5);
    }
    /**
     * Check if cell has outgoing flow
     */
    hasOutgoingFlow(x, y) {
        return this.movementVectors.some(v => {
            const fromX = Math.floor(v.from.x * this.config.gridWidth);
            const fromY = Math.floor(v.from.y * this.config.gridHeight);
            return fromX === x && fromY === y;
        });
    }
    /**
     * Check if grid coordinates are valid
     */
    isValidCell(x, y) {
        return x >= 0 && x < this.config.gridWidth &&
            y >= 0 && y < this.config.gridHeight;
    }
    /**
     * Get current heat map
     */
    getHeatMap() {
        return this.heatMap;
    }
    /**
     * Reset heat map
     */
    reset() {
        this.initializeGrid();
        this.movementVectors = [];
    }
    async cleanup() {
        if (this.decayTimer) {
            clearInterval(this.decayTimer);
            this.decayTimer = undefined;
        }
        this.reset();
        console.log("Heat map generator cleaned up");
    }
    getHealth() {
        const totalIntensity = this.heatMap
            .flat()
            .reduce((sum, cell) => sum + cell.intensity, 0);
        return {
            status: "healthy",
            details: `Grid: ${this.config.gridWidth}x${this.config.gridHeight}, Total intensity: ${totalIntensity.toFixed(2)}, Movements: ${this.movementVectors.length}`,
        };
    }
}

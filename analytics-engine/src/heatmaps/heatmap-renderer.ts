/**
 * Heatmap Renderer
 * 
 * Renders heatmap grids to PNG/JPEG images with:
 * - Multiple normalization strategies (linear, log, percentile)
 * - Color mapping (jet, viridis, hot, cool)
 * - Transparent overlays
 * - Background image composition
 */

import sharp from 'sharp';
import { HeatmapRenderRequest, HeatmapNormalization } from './heatmap-types';

export interface ColorMap {
    name: string;
    colors: Array<{ r: number; g: number; b: number }>;
}

/**
 * Pre-defined color maps for heatmap visualization
 */
const COLOR_MAPS: Record<string, ColorMap> = {
    jet: {
        name: 'jet',
        colors: [
            { r: 0, g: 0, b: 128 },      // Dark blue
            { r: 0, g: 0, b: 255 },      // Blue
            { r: 0, g: 255, b: 255 },    // Cyan
            { r: 0, g: 255, b: 0 },      // Green
            { r: 255, g: 255, b: 0 },    // Yellow
            { r: 255, g: 0, b: 0 },      // Red
            { r: 128, g: 0, b: 0 },      // Dark red
        ],
    },
    hot: {
        name: 'hot',
        colors: [
            { r: 0, g: 0, b: 0 },        // Black
            { r: 128, g: 0, b: 0 },      // Dark red
            { r: 255, g: 0, b: 0 },      // Red
            { r: 255, g: 128, b: 0 },    // Orange
            { r: 255, g: 255, b: 0 },    // Yellow
            { r: 255, g: 255, b: 255 },  // White
        ],
    },
    cool: {
        name: 'cool',
        colors: [
            { r: 0, g: 255, b: 255 },    // Cyan
            { r: 128, g: 128, b: 255 },  // Light blue
            { r: 255, g: 0, b: 255 },    // Magenta
        ],
    },
    viridis: {
        name: 'viridis',
        colors: [
            { r: 68, g: 1, b: 84 },      // Dark purple
            { r: 59, g: 82, b: 139 },    // Blue
            { r: 33, g: 145, b: 140 },   // Teal
            { r: 94, g: 201, b: 98 },    // Green
            { r: 253, g: 231, b: 37 },   // Yellow
        ],
    },
};

/**
 * Heatmap renderer using sharp
 */
export class HeatmapRenderer {
    /**
     * Render heatmap to PNG buffer
     */
    async renderPNG(request: HeatmapRenderRequest): Promise<Buffer> {
        const rgba = this.createRGBABuffer(request);

        let image = sharp(rgba, {
            raw: {
                width: request.width,
                height: request.height,
                channels: 4,
            },
        });

        // Resize to output dimensions
        if (
            request.outputWidth !== request.width ||
            request.outputHeight !== request.height
        ) {
            image = image.resize(request.outputWidth, request.outputHeight, {
                kernel: 'cubic',
            });
        }

        // Composite with background if provided
        if (request.background) {
            const background = await this.prepareBackground(
                request.background,
                request.outputWidth,
                request.outputHeight,
            );

            image = sharp(background).composite([
                {
                    input: await image.png().toBuffer(),
                    blend: 'over',
                },
            ]);
        }

        return await image.png().toBuffer();
    }

    /**
     * Render heatmap to JPEG buffer
     */
    async renderJPEG(request: HeatmapRenderRequest, quality = 90): Promise<Buffer> {
        const rgba = this.createRGBABuffer(request);

        let image = sharp(rgba, {
            raw: {
                width: request.width,
                height: request.height,
                channels: 4,
            },
        });

        // Resize to output dimensions
        if (
            request.outputWidth !== request.width ||
            request.outputHeight !== request.height
        ) {
            image = image.resize(request.outputWidth, request.outputHeight, {
                kernel: 'cubic',
            });
        }

        // For JPEG, need to handle transparency
        if (request.background) {
            const background = await this.prepareBackground(
                request.background,
                request.outputWidth,
                request.outputHeight,
            );

            image = sharp(background).composite([
                {
                    input: await image.png().toBuffer(),
                    blend: 'over',
                },
            ]);
        } else {
            // Create white background for JPEG (no transparency support)
            const whiteBackground = Buffer.alloc(
                request.width * request.height * 3,
                255,
            );

            image = sharp(whiteBackground, {
                raw: {
                    width: request.width,
                    height: request.height,
                    channels: 3,
                },
            }).composite([
                {
                    input: await image.png().toBuffer(),
                    blend: 'over',
                },
            ]);
        }

        return await image.jpeg({ quality }).toBuffer();
    }

    /**
     * Render transparent heatmap (no background)
     */
    async renderTransparent(request: HeatmapRenderRequest): Promise<Buffer> {
        return await this.renderPNG({
            ...request,
            background: undefined,
        });
    }

    // --- Private methods ---

    /**
     * Create RGBA buffer from heatmap grid
     */
    private createRGBABuffer(request: HeatmapRenderRequest): Buffer {
        const {
            grid,
            width,
            height,
            normalization = 'log',
            percentile = 0.99,
            opacity = 0.65,
            colormap = 'jet',
        } = request;

        const rgba = Buffer.alloc(width * height * 4);
        const colorMap = COLOR_MAPS[colormap] || COLOR_MAPS.jet;

        // Normalize grid values
        const normalizedGrid = this.normalizeGrid(
            grid,
            normalization,
            percentile,
        );

        // Map normalized values to colors
        for (let i = 0; i < grid.length; i++) {
            const normalizedValue = normalizedGrid[i];
            const color = this.mapValueToColor(normalizedValue, colorMap);

            const pixelIndex = i * 4;
            rgba[pixelIndex] = color.r;
            rgba[pixelIndex + 1] = color.g;
            rgba[pixelIndex + 2] = color.b;
            rgba[pixelIndex + 3] = Math.round(normalizedValue * 255 * opacity);
        }

        return rgba;
    }

    /**
     * Normalize grid values to [0, 1] range
     */
    private normalizeGrid(
        grid: Float32Array,
        normalization: HeatmapNormalization,
        percentile: number,
    ): Float32Array {
        const normalized = new Float32Array(grid.length);

        // Find min and max
        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i < grid.length; i++) {
            const value = grid[i];
            if (value > 0) {
                min = Math.min(min, value);
                max = Math.max(max, value);
            }
        }

        if (min === Infinity || max === -Infinity) {
            return normalized; // All zeros
        }

        // Apply normalization strategy
        switch (normalization) {
            case 'linear':
                for (let i = 0; i < grid.length; i++) {
                    if (grid[i] > 0) {
                        normalized[i] = (grid[i] - min) / (max - min);
                    }
                }
                break;

            case 'log':
                // Logarithmic normalization for better dynamic range
                const logMin = Math.log1p(min);
                const logMax = Math.log1p(max);
                const logRange = logMax - logMin;

                for (let i = 0; i < grid.length; i++) {
                    if (grid[i] > 0) {
                        const logValue = Math.log1p(grid[i]);
                        normalized[i] = (logValue - logMin) / logRange;
                    }
                }
                break;

            case 'percentile':
                // Percentile clipping to handle outliers
                const nonZeroValues: number[] = [];
                for (let i = 0; i < grid.length; i++) {
                    if (grid[i] > 0) {
                        nonZeroValues.push(grid[i]);
                    }
                }

                if (nonZeroValues.length > 0) {
                    nonZeroValues.sort((a, b) => a - b);
                    const ceiling = this.getPercentile(nonZeroValues, percentile);

                    for (let i = 0; i < grid.length; i++) {
                        if (grid[i] > 0) {
                            const clipped = Math.min(grid[i], ceiling);
                            normalized[i] = (clipped - min) / (ceiling - min);
                        }
                    }
                }
                break;
        }

        return normalized;
    }

    /**
     * Map normalized value [0, 1] to RGB color using color map
     */
    private mapValueToColor(
        value: number,
        colorMap: ColorMap,
    ): { r: number; g: number; b: number } {
        if (value <= 0) {
            return { r: 0, g: 0, b: 0 };
        }

        const colors = colorMap.colors;
        const numColors = colors.length;

        // Map value to color map position
        const position = value * (numColors - 1);
        const lowerIndex = Math.floor(position);
        const upperIndex = Math.min(lowerIndex + 1, numColors - 1);
        const fraction = position - lowerIndex;

        const lowerColor = colors[lowerIndex];
        const upperColor = colors[upperIndex];

        // Interpolate between colors
        return {
            r: Math.round(
                lowerColor.r + fraction * (upperColor.r - lowerColor.r),
            ),
            g: Math.round(
                lowerColor.g + fraction * (upperColor.g - lowerColor.g),
            ),
            b: Math.round(
                lowerColor.b + fraction * (upperColor.b - lowerColor.b),
            ),
        };
    }

    /**
     * Prepare background image
     */
    private async prepareBackground(
        background: Buffer,
        width: number,
        height: number,
    ): Promise<Buffer> {
        return await sharp(background)
            .resize(width, height, {
                fit: 'cover',
                position: 'center',
            })
            .toBuffer();
    }

    /**
     * Calculate percentile from array
     */
    private getPercentile(sortedValues: number[], percentile: number): number {
        if (sortedValues.length === 0) {
            return 0;
        }

        const index = Math.ceil(sortedValues.length * percentile) - 1;
        return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
    }
}

/**
 * Create a color legend for heatmaps
 */
export async function createColorLegend(
    colormap: string = 'jet',
    width = 300,
    height = 50,
): Promise<Buffer> {
    const colorMap = COLOR_MAPS[colormap] || COLOR_MAPS.jet;
    const rgba = Buffer.alloc(width * height * 4);

    // Create gradient
    for (let x = 0; x < width; x++) {
        const value = x / (width - 1);
        const color = mapValueToColorHelper(value, colorMap);

        for (let y = 0; y < height; y++) {
            const pixelIndex = (y * width + x) * 4;
            rgba[pixelIndex] = color.r;
            rgba[pixelIndex + 1] = color.g;
            rgba[pixelIndex + 2] = color.b;
            rgba[pixelIndex + 3] = 255;
        }
    }

    return await sharp(rgba, {
        raw: {
            width,
            height,
            channels: 4,
        },
    })
        .png()
        .toBuffer();
}

/**
 * Helper function for color mapping
 */
function mapValueToColorHelper(
    value: number,
    colorMap: ColorMap,
): { r: number; g: number; b: number } {
    if (value <= 0) {
        return { r: 0, g: 0, b: 0 };
    }

    const colors = colorMap.colors;
    const numColors = colors.length;

    const position = value * (numColors - 1);
    const lowerIndex = Math.floor(position);
    const upperIndex = Math.min(lowerIndex + 1, numColors - 1);
    const fraction = position - lowerIndex;

    const lowerColor = colors[lowerIndex];
    const upperColor = colors[upperIndex];

    return {
        r: Math.round(lowerColor.r + fraction * (upperColor.r - lowerColor.r)),
        g: Math.round(lowerColor.g + fraction * (upperColor.g - lowerColor.g)),
        b: Math.round(lowerColor.b + fraction * (upperColor.b - lowerColor.b)),
    };
}

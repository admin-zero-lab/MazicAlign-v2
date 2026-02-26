import React, { useEffect, useRef, useState } from 'react';
import { LayerData } from '@services/slicer/types';

interface SlicePreviewProps {
    layers: LayerData[];
    nozzleDiameter?: number;
}

const SlicePreview: React.FC<SlicePreviewProps> = ({ layers, nozzleDiameter = 0.4 }) => {
    const [currentLayerIndex, setCurrentLayerIndex] = useState(0);
    const [simulationProgress, setSimulationProgress] = useState(100); // 0 to 100%
    const [viewMode, setViewMode] = useState<'gcode' | 'image'>('gcode');
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (layers.length === 0) return;
        drawLayer();
    }, [currentLayerIndex, layers, viewMode, simulationProgress]);

    const drawLayer = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const layer = layers[currentLayerIndex];
        const width = canvas.width;
        const height = canvas.height;

        // Clear
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        if (viewMode === 'image' && layer.imageData) {
            const img = new Image();
            img.onload = () => {
                // Draw image centered and scaled to fit
                const scale = Math.min(width / img.width, height / img.height) * 0.9;
                const x = (width - img.width * scale) / 2;
                const y = (height - img.height * scale) / 2;
                ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            };
            img.src = layer.imageData;
        } else {
            // Draw G-code path (Polygons + Nozzle Path)
            // Auto-scale to fit
            // Find bounds of all polygons in this layer
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

            // If no polygons, just return
            if (layer.polygons.length === 0) return;

            layer.polygons.forEach(poly => {
                poly.forEach(p => {
                    if (p.x < minX) minX = p.x;
                    if (p.x > maxX) maxX = p.x;
                    if (p.y < minY) minY = p.y;
                    if (p.y > maxY) maxY = p.y;
                });
            });

            const padding = 20;
            const rangeX = maxX - minX || 1;
            const rangeY = maxY - minY || 1;
            const scale = Math.min((width - padding * 2) / rangeX, (height - padding * 2) / rangeY);

            const cx = width / 2;
            const cy = height / 2;
            const centerPolyX = (minX + maxX) / 2;
            const centerPolyY = (minY + maxY) / 2;

            // Helper to transform coordinates
            const tx = (x: number) => cx + (x - centerPolyX) * scale;
            const ty = (y: number) => cy - (y - centerPolyY) * scale; // Flip Y

            // 1. Draw Original Polygons (Green Outline)
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 1;
            ctx.beginPath();

            layer.polygons.forEach(poly => {
                if (poly.length < 2) return;

                const start = poly[0];
                ctx.moveTo(tx(start.x), ty(start.y));

                for (let i = 1; i < poly.length; i++) {
                    const p = poly[i];
                    ctx.lineTo(tx(p.x), ty(p.y));
                }
                ctx.closePath();
            });
            ctx.stroke();

            // 2. Draw Nozzle Path (if available)
            if (layer.paths && layer.paths.segments.length > 0) {
                const segments = layer.paths.segments;
                const totalSegments = segments.length;
                const limit = Math.floor((simulationProgress / 100) * totalSegments);

                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';

                for (let i = 0; i < limit; i++) {
                    const seg = segments[i];

                    // Skip if it's the very first move (nothing to draw from)
                    if (i === 0) continue;

                    const prev = segments[i - 1];

                    ctx.beginPath();
                    ctx.moveTo(tx(prev.x), ty(prev.y));
                    ctx.lineTo(tx(seg.x), ty(seg.y));

                    if (seg.type === 'extrude') {
                        // Extrusion: White/Gray, thicker
                        ctx.strokeStyle = `rgba(255, 255, 255, ${0.8})`; // Shading
                        // Scale line width based on nozzle diameter
                        // Add slight visual overlap (1.1x) to prevent sub-pixel gaps in preview
                        ctx.lineWidth = Math.max(1, nozzleDiameter * scale * 1.1);
                        ctx.stroke();
                    } else if (seg.type === 'move') {
                        // Travel: Blue, thinner
                        ctx.strokeStyle = 'rgba(0, 100, 255, 0.5)';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
                // Draw Nozzle Position
                if (limit > 0 && limit < totalSegments) {
                    const nozzle = segments[limit - 1];
                    ctx.fillStyle = 'red';
                    ctx.beginPath();
                    ctx.arc(tx(nozzle.x), ty(nozzle.y), 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    };

    if (layers.length === 0) {
        return <div className="text-gray-400 text-center p-4">No sliced data available</div>;
    }

    return (
        <div className="bg-gray-800 text-white p-4 rounded-lg shadow-lg w-full max-w-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">Layer Preview</h2>
                <div className="space-x-2">
                    <button
                        onClick={() => setViewMode('gcode')}
                        className={`px-3 py-1 rounded text-sm ${viewMode === 'gcode' ? 'bg-blue-600' : 'bg-gray-600'}`}
                    >
                        FDM Path
                    </button>
                    <button
                        onClick={() => setViewMode('image')}
                        className={`px-3 py-1 rounded text-sm ${viewMode === 'image' ? 'bg-blue-600' : 'bg-gray-600'}`}
                    >
                        DLP Mask
                    </button>
                </div>
            </div>

            <div className="flex gap-4">
                {/* Canvas Area */}
                <div className="relative border border-gray-600 rounded bg-black flex-1 aspect-video">
                    <canvas
                        ref={canvasRef}
                        width={800}
                        height={500}
                        className="w-full h-full object-contain"
                    />
                    <div className="absolute top-2 left-2 text-xs bg-black bg-opacity-50 px-2 py-1 rounded pointer-events-none">
                        Layer: {currentLayerIndex + 1} / {layers.length} (Z: {layers[currentLayerIndex].z.toFixed(2)}mm)
                    </div>
                </div>

                {/* Vertical Layer Slider */}
                <div className="flex flex-col items-center justify-center bg-gray-700 rounded p-2 h-auto">
                    <span className="text-xs mb-2">{layers.length}</span>
                    <input
                        type="range"
                        min={0}
                        max={layers.length - 1}
                        value={currentLayerIndex}
                        onChange={(e) => setCurrentLayerIndex(parseInt(e.target.value))}
                        className="h-64 appearance-slider-vertical w-2 bg-gray-600 rounded-lg cursor-pointer"
                        style={{ writingMode: 'vertical-lr', direction: 'rtl' }} // Vertical slider hack
                    />
                    <span className="text-xs mt-2">1</span>
                </div>
            </div>

            {/* Horizontal Simulation Slider */}
            {viewMode === 'gcode' && (
                <div className="bg-gray-700 p-3 rounded">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Simulation Start</span>
                        <span>End</span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={simulationProgress}
                        onChange={(e) => setSimulationProgress(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    />
                </div>
            )}
        </div>
    );
};

export default SlicePreview;

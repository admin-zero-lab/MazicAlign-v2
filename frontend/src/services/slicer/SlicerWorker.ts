import { SlicerWorkerMessage, SlicerWorkerResponse } from './types';
import { SliceEngine } from './SliceEngine';
import { GCodeGenerator } from './GCodeGenerator';
import { ImageGenerator } from './ImageGenerator';

const ctx: Worker = self as any;

ctx.addEventListener('message', async (event: MessageEvent<SlicerWorkerMessage>) => {
    const message = event.data;

    switch (message.type) {
        case 'SLICE':
            try {
                const { meshData, settings } = message.payload;

                postMessage({
                    type: 'PROGRESS',
                    payload: { progress: 0, currentLayer: 0, totalLayers: 0, message: 'Starting slice...' }
                });

                // 1. Slice Geometry
                const engine = new SliceEngine(meshData, settings);
                const layers = engine.slice();

                postMessage({
                    type: 'PROGRESS',
                    payload: { progress: 30, currentLayer: 0, totalLayers: layers.length, message: 'Geometry sliced. Generating output...' }
                });

                // 2. Generate Output (G-code & Images)
                const gcodeGen = new GCodeGenerator(settings);
                // Assuming 1920x1080 projector, 50 micron pixel size -> scale = 1/0.05 = 20 pixels/mm
                // TODO: Make projector resolution/scale configurable
                const imageGen = new ImageGenerator(1920, 1080, 20);

                for (let i = 0; i < layers.length; i++) {
                    const layer = layers[i];

                    // Generate G-code
                    const { gcode, paths } = gcodeGen.generateLayer(layer, layer.z, i);
                    layer.gcode = gcode;
                    layer.paths = paths;

                    // Generate Image
                    layer.imageData = await imageGen.generateLayer(layer.polygons);

                    // Report Progress
                    if (i % 10 === 0) {
                        const progress = 30 + (i / layers.length) * 70;
                        postMessage({
                            type: 'PROGRESS',
                            payload: {
                                progress: Math.round(progress),
                                currentLayer: i + 1,
                                totalLayers: layers.length,
                                message: `Processing layer ${i + 1}/${layers.length}`
                            }
                        });
                    }
                }

                postMessage({ type: 'COMPLETE', payload: layers });

            } catch (error) {
                console.error('Slicer error:', error);
                postMessage({
                    type: 'ERROR',
                    payload: error instanceof Error ? error.message : 'Unknown slicing error'
                });
            }
            break;

        case 'CANCEL':
            // Handle cancellation (not fully implemented in sync loop)
            break;
    }
});

function postMessage(message: SlicerWorkerResponse) {
    ctx.postMessage(message);
}

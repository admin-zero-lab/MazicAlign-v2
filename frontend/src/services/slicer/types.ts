
export interface SliceSettings {
    // Common
    layerHeight: number;      // mm
    buildWidth: number;       // mm
    buildDepth: number;       // mm
    buildHeight: number;      // mm

    // FDM (Material)
    fdmSpeed: number;         // mm/s (XY Speed)
    fdmExtrusionRate: number; // mm/s (Extruder Speed)
    nozzleDiameter: number;   // mm
    wallCount: number;        // Count
    infillPercentage: number; // 0-100
    infillPattern: 'lines' | 'grid' | 'zigzag'; // New: Infill Pattern
    infillOverlapPercentage: number; // New: Overlap with walls
    wallOverlapPercentage: number;   // New: Overlap between walls
    outerWallOverlapPercentage: number; // New: Overlap of first wall with outer contour
    wallPrintOrder: 'inner-to-outer' | 'outer-to-inner';
    printOrder: 'walls-first' | 'infill-first'; // New: Global Print Order
    enableGapFilling: boolean;       // New: Enable/Disable Gap Filling

    // DLP
    resolutionX: number;      // pixels
    resolutionY: number;      // pixels
    pixelSize: number;        // microns (um) - calculated or linked
    lightPower: number;       // % or value
    exposureTime: number;     // seconds
    zLiftSpeed: number;       // mm/s (Z-axis move speed)

    // Optional / Advanced
    bottomExposure?: number;
    bottomLayers?: number;
    liftDistance?: number;
    retractSpeed?: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface LayerData {
    index: number;
    z: number;
    polygons: Point[][];      // Contours of the slice
    gcode: string;            // FDM commands for this layer
    paths?: GCodePath;        // Structured path data for visualization
    imageData: string;        // Data URL for DLP mask (or Blob)
}

export interface PathSegment {
    x: number;
    y: number;
    type: 'move' | 'extrude' | 'retract';
    extrusion?: number; // E value
}

export interface GCodePath {
    segments: PathSegment[];
    totalExtrusion: number;
}

export interface SlicerProgress {
    progress: number; // 0 to 100
    currentLayer: number;
    totalLayers: number;
    message: string;
}

// Worker Messages
export type SlicerWorkerMessage =
    | { type: 'SLICE', payload: { meshData: Float32Array, settings: SliceSettings } }
    | { type: 'CANCEL' };

export type SlicerWorkerResponse =
    | { type: 'PROGRESS', payload: SlicerProgress }
    | { type: 'COMPLETE', payload: LayerData[] }
    | { type: 'ERROR', payload: string };

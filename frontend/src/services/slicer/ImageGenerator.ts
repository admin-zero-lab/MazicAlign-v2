import { Point } from './types';

export class ImageGenerator {
    private width: number;
    private height: number;
    private scale: number; // Pixels per mm
    private canvas: OffscreenCanvas;
    private ctx: OffscreenCanvasRenderingContext2D;

    constructor(width: number, height: number, scale: number = 10) {
        this.width = width;
        this.height = height;
        this.scale = scale;
        this.canvas = new OffscreenCanvas(width, height);
        this.ctx = this.canvas.getContext('2d')!;
    }

    public async generateLayer(polygons: Point[][]): Promise<string> {
        const ctx = this.ctx;
        const cx = this.width / 2;
        const cy = this.height / 2;

        // Clear background (Black)
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, this.width, this.height);

        // Draw polygons (White)
        ctx.fillStyle = 'white';
        ctx.beginPath();

        for (const poly of polygons) {
            if (poly.length < 3) continue;

            const start = poly[0];
            // Transform coordinates: Center origin, scale, flip Y (optional depending on projector)
            ctx.moveTo(cx + start.x * this.scale, cy - start.y * this.scale);

            for (let i = 1; i < poly.length; i++) {
                const p = poly[i];
                ctx.lineTo(cx + p.x * this.scale, cy - p.y * this.scale);
            }
            ctx.closePath();
        }

        ctx.fill('evenodd');

        // Convert to Blob/DataURL
        // Note: OffscreenCanvas.convertToBlob() is standard in workers
        const blob = await this.canvas.convertToBlob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    }
}

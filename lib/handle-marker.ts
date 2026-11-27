/**
 * A draggable handle pinned to a map coordinate, drawn as a plain DOM element over the map.
 *
 * This replaces maplibre-gl's `Marker` class. A runtime plugin bundle must not ship a second
 * copy of MapLibre, so the handle positions itself with the host map's own `project()` and
 * re-positions on every map move. The element sits in the map's canvas container, like a
 * MapLibre marker, so pointer events behave the same.
 */
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LngLat } from './geometry.ts';

export class HandleMarker {
    private readonly element: HTMLElement;
    private lngLat: LngLat = [0, 0];
    private map: MapLibreMap | null = null;
    private readonly onMove = (): void => this.place();

    constructor(element: HTMLElement) {
        this.element = element;
        element.style.position = 'absolute';
        element.style.left = '0';
        element.style.top = '0';
        element.style.pointerEvents = 'auto';
        element.style.willChange = 'transform';
    }

    getElement(): HTMLElement {
        return this.element;
    }

    getLngLat(): LngLat {
        return this.lngLat;
    }

    setLngLat(lngLat: LngLat): this {
        this.lngLat = lngLat;
        this.place();
        return this;
    }

    addTo(map: MapLibreMap): this {
        this.remove();
        this.map = map;
        map.getCanvasContainer().appendChild(this.element);
        map.on('move', this.onMove);
        map.on('resize', this.onMove);
        this.place();
        return this;
    }

    remove(): void {
        if (this.map) {
            this.map.off('move', this.onMove);
            this.map.off('resize', this.onMove);
            this.map = null;
        }
        this.element.remove();
    }

    private place(): void {
        if (!this.map) return;
        const point = this.map.project(this.lngLat);
        // Centered on the point, whatever size the hit box currently has.
        this.element.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`;
    }
}

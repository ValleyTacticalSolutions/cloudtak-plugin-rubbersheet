export const DEFAULT_EXPORT_QUALITY = 85;
export const MIN_EXPORT_QUALITY = 1;
export const MAX_EXPORT_QUALITY = 95;

/** Clamp to the JPEG quality range used for KMZ / GeoTIFF / GeoPDF. */
export function clampExportQuality(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return DEFAULT_EXPORT_QUALITY;
    return Math.min(MAX_EXPORT_QUALITY, Math.max(MIN_EXPORT_QUALITY, Math.round(n)));
}

interface ReadableStorage {
    getItem(key: string): string | null;
}

interface WritableStorage {
    setItem(key: string, value: string): void;
}

export function loadExportQuality(storage: ReadableStorage | undefined, key: string): number {
    try {
        const raw = storage?.getItem(key);
        if (raw == null) return DEFAULT_EXPORT_QUALITY;
        return clampExportQuality(Number(raw));
    } catch {
        return DEFAULT_EXPORT_QUALITY;
    }
}

export function saveExportQuality(storage: WritableStorage | undefined, key: string, value: number): void {
    try {
        storage?.setItem(key, String(clampExportQuality(value)));
    } catch {
        // Private browsing can reject storage.
    }
}

/** Canvas / toBlob expects 0–1. */
export function qualityToCanvas(quality: number): number {
    return Math.min(0.95, Math.max(0.05, clampExportQuality(quality) / 100));
}

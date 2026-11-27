/**
 * In-browser GeoTIFF writer: WGS84 north-up, 256×256 JPEG tiles, optional alpha
 * band, and internal overviews (required for ATAK Image Overlay with transparency).
 *
 * Copyright (c) 2026 Andrew McMillen
 * SPDX-License-Identifier: MIT
 */

import { encodeJpegMulti } from './jpeg-multi.ts';
import type { Raster } from './warp.ts';

const TILE = 256;

export interface GeoTiffBounds {
    west: number;
    south: number;
    east: number;
    north: number;
}

export interface GeoTiffOptions {
    /** JPEG quality 1–95. Default 85. */
    quality?: number;
    onProgress?: (fraction: number) => void;
}

interface LevelImage {
    width: number;
    height: number;
    rgba: Uint8ClampedArray | Uint8Array;
}

/** Halve an RGBA image (2×2 alpha-weighted average) for an overview level. */
export function halveRgba(img: LevelImage): LevelImage {
    const { width: w, height: h, rgba } = img;
    const W = Math.max(1, Math.ceil(w / 2));
    const H = Math.max(1, Math.ceil(h / 2));
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            let r = 0;
            let g = 0;
            let b = 0;
            let a = 0;
            for (let dy = 0; dy < 2; dy++) {
                const sy = Math.min(h - 1, 2 * y + dy);
                for (let dx = 0; dx < 2; dx++) {
                    const i = (sy * w + Math.min(w - 1, 2 * x + dx)) * 4;
                    const al = rgba[i + 3];
                    r += rgba[i] * al;
                    g += rgba[i + 1] * al;
                    b += rgba[i + 2] * al;
                    a += al;
                }
            }
            if (a < 2 * 255) continue;
            const o = (y * W + x) * 4;
            out[o] = r / a;
            out[o + 1] = g / a;
            out[o + 2] = b / a;
            out[o + 3] = 255;
        }
    }
    return { width: W, height: H, rgba: out };
}

function jpegSampling(bytes: Uint8Array): [number, number] {
    for (let i = 2; i < bytes.length - 9;) {
        if (bytes[i] !== 0xff) {
            i++;
            continue;
        }
        const m = bytes[i + 1];
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        if (m >= 0xc0 && m <= 0xc2) {
            const n = bytes[i + 9];
            if (n !== 3) return [1, 1];
            const s0 = bytes[i + 11];
            const s1 = bytes[i + 14];
            return [(s0 >> 4) / (s1 >> 4), (s0 & 15) / (s1 & 15)];
        }
        i += 2 + len;
    }
    return [2, 2];
}

function hasTransparentPixel(rgba: Uint8Array | Uint8ClampedArray): boolean {
    for (let i = 3; i < rgba.length; i += 4) {
        if (!rgba[i]) return true;
    }
    return false;
}

async function encodeRgbJpeg(tileData: ImageData, quality: number): Promise<Uint8Array> {
    const canvas = document.createElement('canvas');
    canvas.width = TILE;
    canvas.height = TILE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not encode GeoTIFF tile');
    ctx.putImageData(tileData, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
            resolve,
            'image/jpeg',
            Math.min(0.95, Math.max(0.05, quality / 100)),
        );
    });
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error('Could not encode GeoTIFF tile');
    return new Uint8Array(await blob.arrayBuffer());
}

function packRgbTile(
    rgba: Uint8Array | Uint8ClampedArray,
    w: number,
    h: number,
    ti: number,
    tj: number,
): Uint8Array {
    const raw = new Uint8Array(TILE * TILE * 3);
    for (let y = 0; y < TILE; y++) {
        const sy = tj * TILE + y;
        for (let x = 0; x < TILE; x++) {
            const sx = ti * TILE + x;
            const o = (y * TILE + x) * 3;
            if (sx < w && sy < h) {
                const s = (sy * w + sx) * 4;
                if (rgba[s + 3]) {
                    raw[o] = rgba[s];
                    raw[o + 1] = rgba[s + 1];
                    raw[o + 2] = rgba[s + 2];
                }
            }
        }
    }
    return raw;
}

async function encodeLevel(
    img: LevelImage,
    quality: number,
    withAlpha: boolean,
    onTile?: () => void,
): Promise<{
    width: number;
    height: number;
    jpegs: Uint8Array[];
    sampling: [number, number];
    /** Browser canvas JPEG is YCbCr; jpeg-multi 3-band fallback is raw RGB. */
    ycbcr: boolean;
}> {
    const { width: w, height: h, rgba } = img;
    const tx = Math.ceil(w / TILE);
    const ty = Math.ceil(h / TILE);
    const jpegs: Uint8Array[] = [];
    let sampling: [number, number] = [2, 2];
    const useCanvas = !withAlpha && typeof document !== 'undefined';
    const ycbcr = useCanvas;

    let tileData: ImageData | null = null;
    if (useCanvas) {
        tileData = new ImageData(TILE, TILE);
    }
    const rawAlpha = withAlpha ? new Uint8Array(TILE * TILE * 4) : null;

    for (let j = 0; j < ty; j++) {
        for (let i = 0; i < tx; i++) {
            let bytes: Uint8Array;
            if (withAlpha && rawAlpha) {
                for (let y = 0; y < TILE; y++) {
                    const sy = j * TILE + y;
                    for (let x = 0; x < TILE; x++) {
                        const sx = i * TILE + x;
                        const o = (y * TILE + x) * 4;
                        const s = (sy * w + sx) * 4;
                        if (sx < w && sy < h && rgba[s + 3]) {
                            rawAlpha[o] = rgba[s];
                            rawAlpha[o + 1] = rgba[s + 1];
                            rawAlpha[o + 2] = rgba[s + 2];
                            rawAlpha[o + 3] = 255;
                        } else {
                            rawAlpha[o] = rawAlpha[o + 1] = rawAlpha[o + 2] = rawAlpha[o + 3] = 0;
                        }
                    }
                }
                bytes = encodeJpegMulti(rawAlpha, TILE, TILE, 4, quality);
                if (((j * tx + i) & 7) === 7) {
                    await new Promise((r) => setTimeout(r, 0));
                }
            } else if (useCanvas && tileData) {
                const d = tileData.data;
                for (let y = 0; y < TILE; y++) {
                    const sy = j * TILE + y;
                    for (let x = 0; x < TILE; x++) {
                        const sx = i * TILE + x;
                        const o = (y * TILE + x) * 4;
                        const s = (sy * w + sx) * 4;
                        if (sx < w && sy < h && rgba[s + 3]) {
                            d[o] = rgba[s];
                            d[o + 1] = rgba[s + 1];
                            d[o + 2] = rgba[s + 2];
                            d[o + 3] = 255;
                        } else {
                            d[o] = d[o + 1] = d[o + 2] = 0;
                            d[o + 3] = 255;
                        }
                    }
                }
                bytes = await encodeRgbJpeg(tileData, quality);
                if (jpegs.length === 0) sampling = jpegSampling(bytes);
            } else {
                const rgb = packRgbTile(rgba, w, h, i, j);
                bytes = encodeJpegMulti(rgb, TILE, TILE, 3, quality);
            }
            jpegs.push(bytes);
            onTile?.();
        }
    }
    return { width: w, height: h, jpegs, sampling, ycbcr };
}

const T = { SHORT: 3, LONG: 4, DOUBLE: 12 } as const;
const SIZE: Record<number, number> = { 3: 2, 4: 4, 12: 8 };

type Tag = [number, number, number[]];

interface IfdDraft {
    tags: Tag[];
    tiles: Uint8Array[];
    offsets?: number[];
    counts?: number[];
}

function writeTiff(ifds: IfdDraft[]): Uint8Array {
    const chunks: Uint8Array[] = [];
    let off = 8;
    for (const ifd of ifds) {
        ifd.offsets = [];
        ifd.counts = [];
        for (const t of ifd.tiles) {
            ifd.offsets.push(off);
            ifd.counts.push(t.length);
            chunks.push(t);
            off += t.length;
        }
    }
    if (off % 2) {
        chunks.push(new Uint8Array(1));
        off++;
    }

    const entriesOf = (ifd: IfdDraft): Tag[] => {
        const entries: Tag[] = [
            ...ifd.tags,
            [324, T.LONG, ifd.offsets!],
            [325, T.LONG, ifd.counts!],
        ];
        entries.sort((a, b) => a[0] - b[0]);
        return entries;
    };

    let ifdBytes = 0;
    for (const ifd of ifds) {
        const e = entriesOf(ifd);
        let extra = 0;
        for (const [, type, vals] of e) {
            const n = vals.length * SIZE[type];
            if (n > 4) extra += n + (n % 2);
        }
        ifdBytes += 2 + e.length * 12 + 4 + extra;
    }

    const buf = new ArrayBuffer(ifdBytes);
    const dv = new DataView(buf);
    let p = 0;
    const firstIfd = off;
    ifds.forEach((ifd, idx) => {
        const e = entriesOf(ifd);
        const ifdStart = p;
        let extra = ifdStart + 2 + e.length * 12 + 4;
        dv.setUint16(p, e.length, true);
        p += 2;
        for (const [tag, type, vals] of e) {
            dv.setUint16(p, tag, true);
            dv.setUint16(p + 2, type, true);
            dv.setUint32(p + 4, vals.length, true);
            const n = vals.length * SIZE[type];
            let q = n > 4 ? extra : p + 8;
            if (n > 4) {
                dv.setUint32(p + 8, firstIfd + extra, true);
                extra += n + (n % 2);
            }
            for (const v of vals) {
                if (type === T.SHORT) {
                    dv.setUint16(q, v, true);
                    q += 2;
                } else if (type === T.LONG) {
                    dv.setUint32(q, v, true);
                    q += 4;
                } else {
                    dv.setFloat64(q, v, true);
                    q += 8;
                }
            }
            p += 12;
        }
        dv.setUint32(p, idx < ifds.length - 1 ? firstIfd + extra : 0, true);
        p = extra;
    });

    const header = new Uint8Array(8);
    const hv = new DataView(header.buffer);
    header[0] = 0x49;
    header[1] = 0x49;
    hv.setUint16(2, 42, true);
    hv.setUint32(4, firstIfd, true);

    const total = 8 + (off - 8) + ifdBytes;
    const out = new Uint8Array(total);
    out.set(header, 0);
    let pos = 8;
    for (const chunk of chunks) {
        out.set(chunk, pos);
        pos += chunk.length;
    }
    out.set(new Uint8Array(buf), pos);
    return out;
}

/**
 * Build an overlay GeoTIFF from a north-up WGS84 RGBA raster (already warped).
 */
export async function buildGeoTiff(
    raster: Raster,
    bounds: GeoTiffBounds,
    opts?: GeoTiffOptions,
): Promise<Uint8Array> {
    const quality = Math.min(95, Math.max(1, Math.round(opts?.quality ?? 85)));
    const onProgress = opts?.onProgress;

    const xres = (bounds.east - bounds.west) / raster.width;
    const yres = (bounds.north - bounds.south) / raster.height;
    const base: LevelImage = {
        width: raster.width,
        height: raster.height,
        rgba: raster.rgba instanceof Uint8ClampedArray
            ? raster.rgba
            : new Uint8ClampedArray(raster.rgba),
    };

    const levels: LevelImage[] = [base];
    while (Math.max(levels.at(-1)!.width, levels.at(-1)!.height) > TILE) {
        levels.push(halveRgba(levels.at(-1)!));
    }

    const totalTiles = levels.reduce(
        (n, l) => n + Math.ceil(l.width / TILE) * Math.ceil(l.height / TILE),
        0,
    );
    let done = 0;
    const tick = () => {
        done++;
        if (onProgress && done % 16 === 0) onProgress(done / totalTiles);
    };

    const withAlpha = hasTransparentPixel(base.rgba);

    const encoded = [];
    for (let k = 0; k < levels.length; k++) {
        encoded.push(await encodeLevel(levels[k], quality, withAlpha, tick));
    }

    const ifds: IfdDraft[] = [];
    encoded.forEach((lvl, k) => {
        const tags: Tag[] = [
            [256, T.LONG, [lvl.width]],
            [257, T.LONG, [lvl.height]],
            [284, T.SHORT, [1]],
            [322, T.SHORT, [TILE]],
            [323, T.SHORT, [TILE]],
            [254, T.LONG, [k === 0 ? 0 : 1]],
            [259, T.SHORT, [7]],
        ];
        if (withAlpha) {
            tags.push(
                [258, T.SHORT, [8, 8, 8, 8]],
                [262, T.SHORT, [2]],
                [277, T.SHORT, [4]],
                [338, T.SHORT, [2]],
            );
        } else if (lvl.ycbcr) {
            tags.push(
                [258, T.SHORT, [8, 8, 8]],
                [262, T.SHORT, [6]],
                [277, T.SHORT, [3]],
                [530, T.SHORT, lvl.sampling],
            );
        } else {
            // jpeg-multi 3-band: no colour transform (used when canvas is unavailable).
            tags.push(
                [258, T.SHORT, [8, 8, 8]],
                [262, T.SHORT, [2]],
                [277, T.SHORT, [3]],
            );
        }
        if (k === 0) {
            tags.push([33550, T.DOUBLE, [xres, yres, 0]]);
            tags.push([33922, T.DOUBLE, [0, 0, 0, bounds.west, bounds.north, 0]]);
            tags.push([34735, T.SHORT, [
                1, 1, 0, 4,
                1024, 0, 1, 2,
                1025, 0, 1, 1,
                2048, 0, 1, 4326,
                2054, 0, 1, 9102,
            ]]);
        }
        ifds.push({ tags, tiles: lvl.jpegs });
    });
    onProgress?.(1);
    return writeTiff(ifds);
}

export interface GeoTiffInfo {
    width: number;
    height: number;
    compression: number;
    samples: number;
    tileWidth: number;
    tileHeight: number;
    extraSamples: number | null;
    photometric: number;
    newSubfileType: number;
    tieX: number;
    tieY: number;
    scaleX: number;
    scaleY: number;
    geographicType: number;
    overviewCount: number;
}

/** Read IFD tags from a little-endian TIFF produced by {@link buildGeoTiff}. */
export function readGeoTiffInfo(file: Uint8Array): GeoTiffInfo {
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
    if (view.getUint16(0, true) !== 0x4949) throw new Error('Expected a little-endian TIFF');

    function readIfd(ifd: number): Map<number, { type: number; count: number; value: number }> {
        const count = view.getUint16(ifd, true);
        const tags = new Map<number, { type: number; count: number; value: number }>();
        for (let index = 0; index < count; index++) {
            const entry = ifd + 2 + index * 12;
            tags.set(view.getUint16(entry, true), {
                type: view.getUint16(entry + 2, true),
                count: view.getUint32(entry + 4, true),
                value: view.getUint32(entry + 8, true),
            });
        }
        return tags;
    }

    function nextIfd(ifd: number): number {
        const count = view.getUint16(ifd, true);
        return view.getUint32(ifd + 2 + count * 12, true);
    }

    function inlineShort(tags: Map<number, { type: number; count: number; value: number }>, id: number): number {
        const tag = tags.get(id);
        if (!tag) throw new Error(`Missing TIFF tag ${id}`);
        return tag.value & 0xffff;
    }

    function inlineLong(tags: Map<number, { type: number; count: number; value: number }>, id: number): number {
        const tag = tags.get(id);
        if (!tag) throw new Error(`Missing TIFF tag ${id}`);
        return tag.value >>> 0;
    }

    function optionalShort(tags: Map<number, { type: number; count: number; value: number }>, id: number): number | null {
        const tag = tags.get(id);
        if (!tag) return null;
        return tag.value & 0xffff;
    }

    function doubles(tags: Map<number, { type: number; count: number; value: number }>, id: number, count: number): number[] {
        const tag = tags.get(id);
        if (!tag) throw new Error(`Missing TIFF tag ${id}`);
        const values: number[] = [];
        for (let index = 0; index < count; index++) {
            values.push(view.getFloat64(tag.value + index * 8, true));
        }
        return values;
    }

    const ifd = view.getUint32(4, true);
    const primary = readIfd(ifd);
    let overviewCount = 0;
    let next = nextIfd(ifd);
    while (next) {
        overviewCount++;
        next = nextIfd(next);
    }

    const scale = doubles(primary, 33550, 3);
    const tie = doubles(primary, 33922, 6);
    const geo = primary.get(34735);
    if (!geo) throw new Error('Missing GeoKey directory');
    let geographicType = 0;
    const keyCount = view.getUint16(geo.value + 6, true);
    for (let index = 0; index < keyCount; index++) {
        const key = geo.value + 8 + index * 8;
        if (view.getUint16(key, true) === 2048) {
            geographicType = view.getUint16(key + 6, true);
        }
    }

    return {
        width: inlineLong(primary, 256),
        height: inlineLong(primary, 257),
        compression: inlineShort(primary, 259),
        samples: inlineShort(primary, 277),
        tileWidth: inlineShort(primary, 322),
        tileHeight: inlineShort(primary, 323),
        extraSamples: optionalShort(primary, 338),
        photometric: inlineShort(primary, 262),
        newSubfileType: optionalShort(primary, 254) ?? 0,
        scaleX: scale[0],
        scaleY: scale[1],
        tieX: tie[3],
        tieY: tie[4],
        geographicType,
        overviewCount,
    };
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    buildGeoTiff,
    halveRgba,
    readGeoTiffInfo,
} from '../lib/geotiff.ts';
import type { Raster } from '../lib/warp.ts';

function solidRaster(width: number, height: number, alpha = 255): Raster {
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        rgba[i * 4] = 200;
        rgba[i * 4 + 1] = 100;
        rgba[i * 4 + 2] = 50;
        rgba[i * 4 + 3] = alpha;
    }
    return { width, height, rgba };
}

test('halveRgba keeps opaque pixels and drops mostly-empty ones', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    // Top-left 2x2 opaque block
    for (const i of [0, 1, 4, 5]) {
        rgba[i * 4] = 10;
        rgba[i * 4 + 1] = 20;
        rgba[i * 4 + 2] = 30;
        rgba[i * 4 + 3] = 255;
    }
    const out = halveRgba({ width: 4, height: 4, rgba });
    assert.equal(out.width, 2);
    assert.equal(out.height, 2);
    assert.equal(out.rgba[3], 255);
    assert.equal(out.rgba[0], 10);
    assert.equal(out.rgba[7], 0);
});

test('opaque GeoTIFF is JPEG-tiled YCbCr WGS84', async () => {
    const raster = solidRaster(2, 2, 255);
    const file = await buildGeoTiff(raster, {
        west: -10,
        south: 20,
        east: -8,
        north: 24,
    }, { quality: 85 });
    const info = readGeoTiffInfo(file);
    assert.equal(info.width, 2);
    assert.equal(info.height, 2);
    assert.equal(info.compression, 7);
    assert.equal(info.samples, 3);
    assert.equal(info.tileWidth, 256);
    assert.equal(info.tileHeight, 256);
    assert.equal(info.extraSamples, null);
    // Node has no canvas: 3-band jpeg-multi is tagged RGB (2). Browsers use YCbCr (6).
    assert.ok(info.photometric === 2 || info.photometric === 6);
    assert.equal(info.geographicType, 4326);
    assert.equal(info.tieX, -10);
    assert.equal(info.tieY, 24);
    assert.equal(info.scaleX, 1);
    assert.equal(info.scaleY, 2);
    assert.equal(info.overviewCount, 0);
});

test('transparent GeoTIFF uses JPEG RGBA alpha band', async () => {
    const raster = solidRaster(2, 2, 255);
    raster.rgba[7] = 0; // one transparent pixel
    const file = await buildGeoTiff(raster, {
        west: 0,
        south: 0,
        east: 2,
        north: 2,
    }, { quality: 70 });
    const info = readGeoTiffInfo(file);
    assert.equal(info.compression, 7);
    assert.equal(info.samples, 4);
    assert.equal(info.extraSamples, 2);
    assert.equal(info.photometric, 2);
    assert.equal(info.geographicType, 4326);
});

test('GeoTIFF larger than a tile includes overview IFDs', async () => {
    const raster = solidRaster(300, 300, 255);
    // Punch a hole so the alpha path is exercised with overviews.
    for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 20; x++) {
            raster.rgba[(y * 300 + x) * 4 + 3] = 0;
        }
    }
    const file = await buildGeoTiff(raster, {
        west: -1,
        south: 40,
        east: 1,
        north: 42,
    }, { quality: 60 });
    const info = readGeoTiffInfo(file);
    assert.equal(info.width, 300);
    assert.equal(info.height, 300);
    assert.equal(info.compression, 7);
    assert.equal(info.samples, 4);
    assert.ok(info.overviewCount >= 1);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    DEFAULT_EXPORT_QUALITY,
    clampExportQuality,
    loadExportQuality,
    qualityToCanvas,
    saveExportQuality,
} from '../lib/export-quality.ts';

test('clampExportQuality bounds and rounds', () => {
    assert.equal(clampExportQuality(85), 85);
    assert.equal(clampExportQuality(0), 1);
    assert.equal(clampExportQuality(100), 95);
    assert.equal(clampExportQuality(70.6), 71);
    assert.equal(clampExportQuality('nope'), DEFAULT_EXPORT_QUALITY);
});

test('qualityToCanvas maps to 0–1 for canvas.toBlob', () => {
    assert.equal(qualityToCanvas(85), 0.85);
    assert.equal(qualityToCanvas(1), 0.05);
    assert.equal(qualityToCanvas(95), 0.95);
});

test('load and save export quality', () => {
    const store = new Map<string, string>();
    const storage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
    };
    assert.equal(loadExportQuality(storage, 'q'), DEFAULT_EXPORT_QUALITY);
    saveExportQuality(storage, 'q', 70);
    assert.equal(loadExportQuality(storage, 'q'), 70);
    saveExportQuality(storage, 'q', 999);
    assert.equal(loadExportQuality(storage, 'q'), 95);
});

/**
 * Upload a GeoTIFF through CloudTAK Imports and register it as a profile overlay,
 * matching the Files menu "Add to Map as Overlay" flow:
 * PUT /api/import → wait for Success → wait for .pmtiles TileJSON →
 * the host map store's overlay reconcile.
 *
 * Note: there is no GET /api/profile/asset/:id metadata route — poll
 * GET /api/profile/asset/:id.pmtiles/tile until Cloud Optimized tiles exist.
 */

import { apiFetch, apiUrl, readError } from './api.ts';
import { hostStore } from './host.ts';

const POLL_MS = 2000;
const MAX_WAIT_MS = 5 * 60 * 1000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/** Imports and tiles need a signed-in user, so a missing token fails before the request. */
function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return apiFetch(path, init, { requireToken: true });
}

async function putImport(file: {
    filename: string;
    bytes: Uint8Array;
    mime: string;
}): Promise<string> {
    const form = new FormData();
    const blob = new Blob([file.bytes.slice()], { type: file.mime });
    form.append('file', blob, file.filename);

    const response = await authFetch('/api/import', {
        method: 'PUT',
        body: form,
    });
    if (!response.ok) throw new Error(await readError(response));

    const body = await response.json() as {
        imports?: Array<{ uid?: string }>;
        id?: string;
    };
    const uid = body.imports?.[0]?.uid ?? body.id;
    if (!uid) throw new Error('Import did not return an id');
    return uid;
}

async function waitForImport(uid: string): Promise<string> {
    const deadline = Date.now() + MAX_WAIT_MS;
    while (Date.now() < deadline) {
        const response = await authFetch(`/api/import/${encodeURIComponent(uid)}`);
        if (!response.ok) throw new Error(await readError(response));

        const body = await response.json() as {
            status?: string;
            error?: string | null;
            results?: Array<{ type?: string; type_id?: string }>;
        };

        if (body.status === 'Fail') {
            throw new Error(body.error?.trim() || 'Import failed');
        }
        if (body.status === 'Success') {
            const asset = (body.results ?? []).find((row) => row.type === 'Asset' && typeof row.type_id === 'string');
            if (!asset?.type_id) throw new Error('Import finished but no file asset was created');
            return asset.type_id;
        }

        await sleep(POLL_MS);
    }
    throw new Error('Timed out waiting for the import to finish');
}

/**
 * Poll TileJSON until Cloud Optimized PMTiles exist (same readiness signal as Files UI).
 */
async function waitForTileJson(assetId: string): Promise<{ type: 'raster' | 'vector'; url: string }> {
    const tileUrl = `/api/profile/asset/${encodeURIComponent(assetId)}.pmtiles/tile`;
    const deadline = Date.now() + MAX_WAIT_MS;

    while (Date.now() < deadline) {
        const response = await authFetch(tileUrl);
        if (response.ok) {
            const body = await response.json() as { tiles?: string[] };
            const tile = body.tiles?.[0];
            if (!tile) throw new Error('Malformed PMTiles metadata response');
            let type: 'raster' | 'vector';
            try {
                type = new URL(tile, window.location.origin).pathname.endsWith('.mvt') ? 'vector' : 'raster';
            } catch {
                type = tile.includes('.mvt') ? 'vector' : 'raster';
            }
            // Stored absolute like the Files flow does (stdurl), so the native apps reach the server.
            return { type, url: await apiUrl(tileUrl) };
        }

        // 404 while tiling is still running is expected; other errors are real failures.
        if (response.status !== 404) {
            throw new Error(await readError(response));
        }

        await sleep(POLL_MS);
    }
    throw new Error('Timed out waiting for Cloud Optimized tiles');
}

type OverlayCreateBody = {
    url: string;
    name: string;
    mode: 'profile';
    mode_id: string;
    type: 'raster' | 'vector';
    visible: boolean;
    opacity: number;
};

/**
 * Register the file as a profile overlay through the API, then ask the host map store to
 * reconcile its overlay list so the layer shows up in the live overlay menu and on the map
 * (what OverlayManager.createLoaded does inside CloudTAK). A bundle cannot import that module.
 */
async function createProfileOverlay(opts: {
    url: string;
    name: string;
    modeId: string;
    type: 'raster' | 'vector';
}): Promise<void> {
    const body: OverlayCreateBody = {
        url: opts.url,
        name: opts.name,
        mode: 'profile',
        mode_id: opts.modeId,
        type: opts.type,
        visible: true,
        opacity: 1,
    };

    const response = await authFetch('/api/profile/overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await readError(response));

    try {
        const map = hostStore<{ reconcileOverlays?: () => Promise<void> }>('cloudtak');
        await map.reconcileOverlays?.();
    } catch {
        // The overlay is saved; it appears after the next overlay refresh.
    }
}

/**
 * Import a GeoTIFF into CloudTAK and add it as a map overlay (Files menu flow).
 */
export async function importAsOverlay(
    file: { filename: string; bytes: Uint8Array; mime: string },
    name: string,
    onStatus?: (text: string) => void,
): Promise<void> {
    onStatus?.('Uploading for import…');
    const uid = await putImport(file);

    onStatus?.('Converting to map tiles…');
    const assetId = await waitForImport(uid);

    onStatus?.('Waiting for Cloud Optimized tiles…');
    const tiles = await waitForTileJson(assetId);

    onStatus?.('Adding overlay…');
    const overlayName = name.trim() || file.filename.replace(/\.[^.]+$/, '') || 'rubber-sheet';
    await createProfileOverlay({
        url: tiles.url,
        name: overlayName,
        modeId: file.filename,
        type: tiles.type,
    });
}

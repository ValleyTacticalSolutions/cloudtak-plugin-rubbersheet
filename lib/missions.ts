import { apiFetch, readError } from './api.ts';
import type { MissionChoice } from './ui-state.ts';

/**
 * Data syncs the "Add to Data Sync" picker offers. A bundle cannot read the host's local
 * subscription database, so the list comes from the server mission catalog (the same set
 * Menu > Data Sync shows); the upload itself enforces write access.
 */
export async function listMissionsForPicker(): Promise<MissionChoice[]> {
    const missions = await listServerMissions();
    return missions.sort((a, b) => a.name.localeCompare(b.name));
}

async function listServerMissions(): Promise<MissionChoice[]> {
    const response = await apiFetch(
        '/api/marti/mission?passwordProtected=true&defaultRole=true&sort=createTime&order=desc',
    );
    if (!response.ok) throw new Error(await readError(response, `Could not list data syncs (${response.status})`));

    const body = await response.json() as {
        items?: Array<{
            guid?: unknown;
            name?: unknown;
            defaultRole?: unknown;
        }>;
    };

    const missions: MissionChoice[] = [];
    for (const item of body.items ?? []) {
        if (typeof item.guid !== 'string' || typeof item.name !== 'string') continue;
        // Server catalog is the same set Menu → Data Sync shows; upload enforces write access.
        missions.push({ guid: item.guid, name: item.name });
    }
    return missions;
}

export async function uploadMissionFile(mission: MissionChoice, file: {
    filename: string;
    bytes: Uint8Array;
    mime: string;
}): Promise<void> {
    const url = `/api/marti/missions/${encodeURIComponent(mission.guid)}/upload?name=${encodeURIComponent(file.filename)}`;
    const headers: Record<string, string> = {
        'Content-Type': file.mime,
    };
    if (mission.token) headers.MissionAuthorization = mission.token;

    const body = file.bytes.buffer.slice(
        file.bytes.byteOffset,
        file.bytes.byteOffset + file.bytes.byteLength,
    ) as ArrayBuffer;

    const response = await apiFetch(url, {
        method: 'POST',
        headers,
        body,
    });

    if (!response.ok) throw new Error(await readError(response, `Upload failed (${response.status})`));
}

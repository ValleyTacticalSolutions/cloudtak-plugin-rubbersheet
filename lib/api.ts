/**
 * The plugin's own API requests (Data Sync upload, Imports, overlay tiles), built on the host
 * bridge in ./host.ts so they reach the CloudTAK server URL with the user's token in the native
 * apps as well as on the web. Responses are returned as `Response` (no throwing on non-2xx, no
 * 20 s timeout) so the existing error mapping in `readError` keeps working.
 */
import { apiFetch as hostFetch, apiUrl as hostApiUrl, token } from './host.ts';
import { errorMessage } from './api-error.ts';

/** Absolute URL for an API path, on the saved server URL in the native apps. */
export async function apiUrl(path: string): Promise<string> {
    return (await hostApiUrl(path)).toString();
}

/** Login token: the host preference, then the stores a plain web session may still use. */
export async function apiToken(): Promise<string | undefined> {
    const stored = await token();
    if (stored) return stored;

    try {
        const plain = localStorage.getItem('token');
        if (plain) return plain;
    } catch {
        // Private browsing can reject storage.
    }

    return readTokenFromCloudTakDb();
}

function readTokenFromCloudTakDb(): Promise<string | undefined> {
    return new Promise((resolve) => {
        const factory = indexedDB as IDBFactory & {
            databases?: () => Promise<Array<{ name?: string }>>;
        };
        const open = () => {
            const request = indexedDB.open('CloudTAK');
            request.onupgradeneeded = () => {
                request.transaction?.abort();
            };
            request.onerror = () => resolve(undefined);
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('config')) {
                    db.close();
                    resolve(undefined);
                    return;
                }
                const tx = db.transaction('config', 'readonly');
                const get = tx.objectStore('config').get('token');
                get.onerror = () => {
                    db.close();
                    resolve(undefined);
                };
                get.onsuccess = () => {
                    db.close();
                    const row = get.result as { value?: unknown } | undefined;
                    resolve(typeof row?.value === 'string' && row.value ? row.value : undefined);
                };
            };
        };

        if (typeof factory.databases !== 'function') {
            open();
            return;
        }
        void factory.databases().then((existing) => {
            if (!existing.some((db) => db.name === 'CloudTAK')) {
                resolve(undefined);
                return;
            }
            open();
        }).catch(() => resolve(undefined));
    });
}

/**
 * fetch against the API with the login token as a Bearer header (unless the caller set an
 * Authorization header). With `requireToken` a missing token is an error instead of an
 * unauthenticated request.
 */
export async function apiFetch(
    path: string,
    init: RequestInit = {},
    opts: { requireToken?: boolean } = {},
): Promise<Response> {
    const token = await apiToken();
    if (!token && opts.requireToken) throw new Error('Not signed in — CloudTAK auth token is missing');

    const headers = new Headers(init.headers);
    if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    return hostFetch(path, {
        ...init,
        headers,
        raw: true,
        timeout: 5 * 60 * 1000,
    });
}

/** Message for a failed response: the body text, or its JSON `message`, or `fallback`. */
export async function readError(response: Response, fallback = `Request failed (${response.status})`): Promise<string> {
    return errorMessage(await response.text(), fallback);
}

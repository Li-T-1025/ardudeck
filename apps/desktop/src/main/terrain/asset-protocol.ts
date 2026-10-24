import { net, protocol, type CustomScheme } from 'electron';
import { pathToFileURL } from 'node:url';
import { ASSET_SCHEME } from '../../shared/tile-source-types.js';
import { sceneMeshByKey } from './scene-mesh-registry.js';

export const ASSET_SCHEME_PRIVILEGES: CustomScheme = {
  scheme: ASSET_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
};

/** ardudeck-asset://mesh/<key>.glb streams the GLB a module registered. Nothing else resolves. */
export function setupAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'mesh') return new Response(null, { status: 404 });
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, '').replace(/\.glb$/, ''));
    const entry = sceneMeshByKey(key);
    if (!entry) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(entry.glb).href);
  });
}

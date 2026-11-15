const NGUONC_API = 'https://phim.nguonc.com/api';
const CINEMETA_API = 'https://v3-cinemeta.strem.io/meta';
const KITSU_API = 'https://anime-kitsu.strem.fun/meta';

const manifest = {
    id: 'com.nuvio.nguonc.only',
    version: '5.2.0',
    name: '🔥 NguonC Phim (Cloudflare)',
    description: 'Addon thuần NguonC (Vietsub / Thuyết minh / Lồng tiếng) cho Nuvio',
    logo: 'https://phim.nguonc.com/public/images/Logo/logonguonc.png',
    resources: [
        'catalog',
        { name: 'meta', types: ['movie', 'series'], idPrefixes: ['nguonc:'] },
        { name: 'stream', types: ['movie', 'series', 'anime'], idPrefixes: ['nguonc:', 'tt', 'tmdb:', 'kitsu:'] }
    ],
    types: ['movie', 'series'],
    idPrefixes: ['nguonc:', 'tt', 'tmdb:', 'kitsu:'],
    catalogs: [
        {
            type: 'movie',
            id: 'nguonc_phim_moi',
            name: '🔥 NguonC - Phim Mới Cập Nhật',
            extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'nguonc_phim_le',
            name: '🔥 NguonC - Phim Lẻ',
            extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'nguonc_phim_bo',
            name: '🔥 NguonC - Phim Bộ',
            extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'nguonc_hoat_hinh',
            name: '🔥 NguonC - Hoạt Hình / Anime',
            extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
        }
    ]
};

function jsonResponse(data) {
    return new Response(JSON.stringify(data), {
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        }
    });
}

async function fetchJson(targetUrl, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Referer': 'https://phim.nguonc.com/'
            }
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        clearTimeout(timer);
        return null;
    }
}

async function fetchNguonC(endpoint) {
    return await fetchJson(`${NGUONC_API}${endpoint}`);
}

function generateSearchKeywords(rawTitle = '') {
    if (!rawTitle) return [];
    const spaced = rawTitle.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    const beforeColon = spaced.split(/[:\-–—]/)[0].trim();
    const cleanWords = beforeColon.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const first3Words = cleanWords.split(' ').slice(0, 3).join(' ');

    return Array.from(new Set([
        rawTitle.trim(),
        spaced,
        beforeColon,
        cleanWords,
        first3Words
    ])).filter(k => k && k.length >= 2);
}

async function resolveKeywordsAndEpisode(type, rawId) {
    const parts = rawId.split(':');
    const prefix = parts[0];
    let titles = [];
    let epNum = null;

    if (prefix.startsWith('tt')) {
        const imdbId = parts[0];
        epNum = parts[2] ? parseInt(parts[2]) : (type !== 'movie' ? 1 : null);
        const cine = await fetchJson(`${CINEMETA_API}/${type}/${imdbId}.json`);
        if (cine?.meta?.name) titles.push(cine.meta.name);
    } else if (prefix === 'kitsu') {
        const kitsuId = parts[1];
        epNum = parts[2] ? parseInt(parts[2]) : 1;
        const kitsu = await fetchJson(`${KITSU_API}/anime/kitsu:${kitsuId}.json`);
        if (kitsu?.meta?.name) titles.push(kitsu.meta.name);
        if (Array.isArray(kitsu?.meta?.aliases)) titles.push(...kitsu.meta.aliases.slice(0, 2));
    } else if (prefix === 'tmdb') {
        const tmdbId = parts[1];
        epNum = parts[3] ? parseInt(parts[3]) : (parts[2] ? parseInt(parts[2]) : (type !== 'movie' ? 1 : null));
        const tmdb = await fetchJson(`https://94c8cb9f702d-tmdb-addon.baby-beamup.club/meta/${type}/tmdb:${tmdbId}.json`);
        if (tmdb?.meta?.name) titles.push(tmdb.meta.name);
    }

    const allKeywords = [];
    for (const t of titles) {
        allKeywords.push(...generateSearchKeywords(t));
    }
    return { keywords: Array.from(new Set(allKeywords)), epNum };
}

export default {
    async fetch(request) {
        if (request.method === 'OPTIONS') return jsonResponse({});

        const url = new URL(request.url);
        const pathname = decodeURIComponent(url.pathname);

        if (pathname === '/' || pathname === '') {
            return new Response(`
                <div style="font-family:sans-serif;max-width:600px;margin:30px auto;padding:20px;border:1px solid #ccc;border-radius:10px;">
                    <h2>🔥 NguonC Addon (v5.2 - Thuần NguonC)</h2>
                    <p>Copy link Manifest dưới đây dán vào Nuvio:</p>
                    <input value="${url.origin}/manifest.json" style="width:100%;padding:10px;font-size:16px;" readonly onclick="this.select()">
                </div>
            `, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }

        if (pathname === '/manifest.json') {
            return jsonResponse(manifest);
        }

        if (pathname.startsWith('/catalog/')) {
            const parts = pathname.replace('/catalog/', '').replace(/\.json$/, '').split('/');
            const type = parts[0];
            const id = parts[1];
            const extra = parts.slice(2).join('/');

            let search = url.searchParams.get('search') || null;
            let skip = parseInt(url.searchParams.get('skip')) || 0;
            if (extra) {
                const p = new URLSearchParams(extra);
                if (p.get('search')) search = p.get('search');
                if (p.get('skip')) skip = parseInt(p.get('skip')) || 0;
            }

            const page = Math.floor(skip / 10) + 1;
            let endpoint = `/films/phim-moi-cap-nhat?page=${page}`;
            if (search) endpoint = `/films/search?keyword=${encodeURIComponent(search)}`;
            else if (id === 'nguonc_phim_le') endpoint = `/films/danh-sach/phim-le?page=${page}`;
            else if (id === 'nguonc_phim_bo') endpoint = `/films/danh-sach/phim-bo?page=${page}`;
            else if (id === 'nguonc_hoat_hinh') endpoint = `/films/the-loai/hoat-hinh?page=${page}`;

            const data = await fetchNguonC(endpoint);
            const metas = (data?.items || []).map(item => ({
                id: `nguonc:${item.slug}`,
                type: type,
                name: item.name,
                poster: item.thumb_url || item.poster_url,
                background: item.poster_url || item.thumb_url,
                description: `[🔥 NguonC] Tên gốc: ${item.original_name || item.name}\nTrạng thái: ${item.current_episode || 'Full'} (${item.quality || 'FHD'} - ${item.language || 'Vietsub'})`
            }));

            return jsonResponse({ metas });
        }

        if (pathname.startsWith('/meta/')) {
            const clean = pathname.replace('/meta/', '').replace(/\.json$/, '');
            const slashIdx = clean.indexOf('/');
            if (slashIdx === -1) return jsonResponse({ meta: null });

            const type = clean.substring(0, slashIdx);
            const rawId = decodeURIComponent(clean.substring(slashIdx + 1));

            if (!rawId.startsWith('nguonc:')) return jsonResponse({ meta: null });

            const slug = rawId.replace('nguonc:', '').split(':')[0];
            const data = await fetchNguonC(`/film/${slug}`);
            const movie = data?.movie;
            if (!movie) return jsonResponse({ meta: null });

            const epMap = new Map();
            (movie.episodes || []).forEach(server => {
                (server.items || []).forEach((ep, idx) => {
                    const epNum = idx + 1;
                    if (!epMap.has(epNum)) {
                        epMap.set(epNum, {
                            id: `nguonc:${movie.slug}:${epNum}`,
                            title: ep.name ? `Tập ${ep.name}` : `Tập ${epNum}`,
                            season: 1,
                            episode: epNum
                        });
                    }
                });
            });

            const videos = Array.from(epMap.values());

            const meta = {
                id: `nguonc:${movie.slug}`,
                type: type,
                name: movie.name,
                poster: movie.thumb_url || movie.poster_url,
                background: movie.poster_url || movie.thumb_url,
                description: `${(movie.description || '').replace(/<[^>]*>?/gm, '')}\n\nTên gốc: ${movie.original_name || ''}\nĐạo diễn: ${movie.director || 'Đang cập nhật'}\nDiễn viên: ${movie.casts || 'Đang cập nhật'}\nChất lượng: ${movie.quality || 'FHD'} - ${movie.language || 'Vietsub'}`,
                releaseInfo: movie.current_episode || ''
            };

            if (type === 'series' || videos.length > 1) {
                meta.videos = videos.length > 0 ? videos : [{
                    id: `nguonc:${movie.slug}:1`,
                    title: 'Full',
                    season: 1,
                    episode: 1
                }];
            } else {
                meta.behaviorHints = {
                    defaultVideoId: `nguonc:${movie.slug}:1`
                };
            }

            return jsonResponse({ meta });
        }

        if (pathname.startsWith('/stream/')) {
            const clean = pathname.replace('/stream/', '').replace(/\.json$/, '');
            const slashIdx = clean.indexOf('/');
            if (slashIdx === -1) return jsonResponse({ streams: [] });

            const type = clean.substring(0, slashIdx);
            const rawId = decodeURIComponent(clean.substring(slashIdx + 1));
            const parts = rawId.split(':');
            const prefix = parts[0];

            let slug = null;
            let targetEpNum = null;

            if (prefix === 'nguonc') {
                slug = parts[1];
                targetEpNum = parts[2] ? parseInt(parts[2]) : 1;
            } else {
                const resolved = await resolveKeywordsAndEpisode(type, rawId);
                targetEpNum = resolved.epNum;

                for (const kw of resolved.keywords) {
                    const searchData = await fetchNguonC(`/films/search?keyword=${encodeURIComponent(kw)}`);
                    if (searchData?.items?.length > 0) {
                        const normKw = kw.toLowerCase();
                        const matched = searchData.items.find(i =>
                            (i.original_name || '').toLowerCase().includes(normKw) ||
                            (i.name || '').toLowerCase().includes(normKw)
                        ) || searchData.items[0];
                        slug = matched.slug;
                        break;
                    }
                }
            }

            if (!slug) return jsonResponse({ streams: [] });

            const detail = await fetchNguonC(`/film/${slug}`);
            const movie = detail?.movie;
            if (!movie || !Array.isArray(movie.episodes)) return jsonResponse({ streams: [] });

            const streams = [];
            for (const server of movie.episodes) {
                const items = server.items || [];
                if (items.length === 0) continue;

                let ep = items[0];
                if (targetEpNum !== null && items.length > 1) {
                    ep = items.find((item, idx) => {
                        const num = parseInt((item.name || item.slug || '').replace(/\D/g, ''));
                        return num === targetEpNum || (idx + 1) === targetEpNum;
                    }) || items[targetEpNum - 1] || items[0];
                }

                if (ep && ep.m3u8) {
                    streams.push({
                        name: `🔥 NguonC\n${server.server_name || 'VIP'}`,
                        title: `${movie.name} - Tập ${ep.name || 'Full'}\n[${movie.quality || 'FHD'} • ${movie.language || 'Vietsub'}]`,
                        url: ep.m3u8,
                        behaviorHints: {
                            notWebReady: false,
                            bingeGroup: `nguonc-${server.server_name || 'vip'}`
                        }
                    });
                }
            }

            return jsonResponse({ streams });
        }

        return new Response('Not Found', { status: 404 });
    }
};

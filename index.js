const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());

const NGUONC_API = 'https://phim.nguonc.com/api';
const KKPHIM_API = 'https://phimapi.com';
const OPHIM_API = 'https://ophim1.com';
const CINEMETA_API = 'https://v3-cinemeta.strem.io/meta';

function createManifest(source = 'all') {
    const catalogs = [];

    if (source === 'all' || source === 'nguonc') {
        catalogs.push(
            {
                type: 'movie',
                id: 'nguonc_movie',
                name: '🔥 NguonC - Phim Lẻ Mới',
                extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
            },
            {
                type: 'series',
                id: 'nguonc_series',
                name: '🔥 NguonC - Phim Bộ Mới',
                extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
            }
        );
    }

    if (source === 'all' || source === 'kkphim') {
        catalogs.push(
            {
                type: 'movie',
                id: 'kkphim_movie',
                name: '⚡ KKPhim - Phim Lẻ Mới',
                extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
            },
            {
                type: 'series',
                id: 'kkphim_series',
                name: '⚡ KKPhim - Phim Bộ Mới',
                extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
            }
        );
    }

    if (source === 'all' || source === 'ophim') {
        catalogs.push(
            {
                type: 'movie',
                id: 'ophim_movie',
                name: '🎬 OPhim - Phim Lẻ Mới',
                extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
            },
            {
                type: 'series',
                id: 'ophim_series',
                name: '🎬 OPhim - Phim Bộ Mới',
                extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
            }
        );
    }

    const configMap = {
        all: {
            id: 'com.nuvio.vn.allinone',
            name: 'VN Phim All-in-One (3 Nguồn)',
            desc: 'Gộp cả 3 nguồn NguonC, KKPhim, OPhim trong 1 addon',
            prefixes: ['nguonc:', 'kkphim:', 'ophim:', 'tt']
        },
        nguonc: {
            id: 'com.nuvio.vn.nguonc',
            name: '🔥 NguonC Phim',
            desc: 'Nguồn phim Vietsub/Thuyết minh từ NguonC',
            prefixes: ['nguonc:', 'tt']
        },
        kkphim: {
            id: 'com.nuvio.vn.kkphim',
            name: '⚡ KKPhim (PhimAPI)',
            desc: 'Nguồn phim tốc độ cao từ KKPhim',
            prefixes: ['kkphim:', 'tt']
        },
        ophim: {
            id: 'com.nuvio.vn.ophim',
            name: '🎬 OPhim (Ổ Phim)',
            desc: 'Kho phim tổng hợp từ OPhim',
            prefixes: ['ophim:', 'tt']
        }
    };

    const cfg = configMap[source] || configMap.all;

    return {
        id: cfg.id,
        version: '3.2.0',
        name: cfg.name,
        description: cfg.desc,
        logo: 'https://phim.nguonc.com/public/images/Logo/logonguonc.png',
        resources: ['catalog', 'meta', 'stream'],
        types: ['movie', 'series'],
        idPrefixes: cfg.prefixes,
        catalogs
    };
}

// Hàm tải JSON thông minh: Tự động dùng Proxy vượt tường lửa nếu NguonC chặn IP của Vercel
async function safeFetchJson(url, timeoutMs = 8000) {
    const isNguonC = url.includes('nguonc.com');

    // Danh sách đường dẫn thử nghiệm (Trực tiếp -> Proxy 1 -> Proxy 2 nếu là NguonC)
    const urlsToTry = isNguonC
        ? [
            url,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
        ]
        : [url];

    for (const targetUrl of urlsToTry) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
            };

            if (targetUrl === url && isNguonC) {
                headers['Referer'] = 'https://phim.nguonc.com/';
            }

            const res = await fetch(targetUrl, { signal: controller.signal, headers });
            clearTimeout(timer);

            if (!res.ok) continue;

            const text = await res.text();
            if (!text || text.trim().startsWith('<')) continue; // Bỏ qua nếu trả về trang HTML chặn của Cloudflare

            const json = JSON.parse(text);
            if (json) return json;
        } catch (e) {
            clearTimeout(timer);
        }
    }
    return null;
}

// Trang chủ + Nút kiểm tra kết nối NguonC
app.get('/', (req, res) => {
    const host = req.headers['x-forwarded-proto']
        ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
        : `http://${req.headers.host}`;
    res.send(`
        <div style="font-family: sans-serif; max-width: 650px; margin: 20px auto; padding: 20px; border: 1px solid #ccc; border-radius: 10px;">
            <h2>🎬 Server Addon Nuvio v3.2 (Bypass Cloudflare NguonC)</h2>
            <p><a href="/debug" target="_blank" style="color: white; background: #e63946; padding: 8px 14px; text-decoration: none; border-radius: 5px; display: inline-block;">🔍 Bấm vào đây để kiểm tra kết nối NguonC / KKPhim / OPhim</a></p>
            <hr>
            <p>🔥 NguonC:<br><input value="${host}/nguonc/manifest.json" style="width:100%;padding:8px;" readonly onclick="this.select()"></p>
            <p>⚡ KKPhim:<br><input value="${host}/kkphim/manifest.json" style="width:100%;padding:8px;" readonly onclick="this.select()"></p>
            <p>🎬 OPhim:<br><input value="${host}/ophim/manifest.json" style="width:100%;padding:8px;" readonly onclick="this.select()"></p>
            <hr>
            <p>Gộp 3 trong 1:<br><input value="${host}/manifest.json" style="width:100%;padding:8px;" readonly onclick="this.select()"></p>
        </div>
    `);
});

// Endpoint kiểm tra trực tiếp xem NguonC có trả về phim hay không
app.get('/debug', async (req, res) => {
    const [nguonc, kkphim, ophim] = await Promise.all([
        safeFetchJson(`${NGUONC_API}/films/phim-moi-cap-nhat?page=1`),
        safeFetchJson(`${KKPHIM_API}/danh-sach/phim-moi-cap-nhat?page=1`),
        safeFetchJson(`${OPHIM_API}/danh-sach/phim-moi-cap-nhat?page=1`)
    ]);

    res.json({
        status: 'Kiểm tra kết nối 3 nguồn từ Vercel',
        nguonc_ok: Boolean(nguonc?.items?.length),
        nguonc_count: nguonc?.items?.length || 0,
        nguonc_sample: nguonc?.items?.[0]?.name || 'Không lấy được (Bị chặn hoặc lỗi)',
        kkphim_ok: Boolean(kkphim?.items?.length),
        kkphim_count: kkphim?.items?.length || 0,
        ophim_ok: Boolean(ophim?.items?.length),
        ophim_count: ophim?.items?.length || 0
    });
});

app.get('/manifest.json', (req, res) => res.json(createManifest('all')));
app.get('/:source(nguonc|kkphim|ophim)/manifest.json', (req, res) => res.json(createManifest(req.params.source)));

function fixImageUrl(url, domain = '') {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${domain.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

function normalizeStr(str = '') {
    return str
        .toLowerCase()
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[:\-–—_.,!?'"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildKeywords(rawTitle = '') {
    if (!rawTitle) return [];
    const spaced = rawTitle.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    const clean = spaced.split(/[:\-–]/)[0].trim();
    return Array.from(new Set([rawTitle.trim(), spaced, clean])).filter(Boolean);
}

async function fetchCmsCatalogItems(baseUrl, isMovie, page, search) {
    let urls = [];
    if (search) {
        urls.push(`${baseUrl}/v1/api/tim-kiem?keyword=${encodeURIComponent(search)}&limit=20`);
    } else {
        const listSlug = isMovie ? 'phim-le' : 'phim-bo';
        urls.push(
            `${baseUrl}/v1/api/danh-sach/${listSlug}?page=${page}&limit=20`,
            `${baseUrl}/danh-sach/phim-moi-cap-nhat?page=${page}`
        );
    }

    for (const u of urls) {
        const data = await safeFetchJson(u);
        const items = data?.data?.items || data?.items || [];
        if (items.length > 0) {
            const imgDomain =
                data?.data?.APP_DOMAIN_CDN_IMAGE ||
                data?.pathImage ||
                (baseUrl.includes('ophim') ? 'https://img.ophim.live/uploads/movies' : 'https://phimimg.com');
            return { items, imgDomain };
        }
    }
    return { items: [], imgDomain: 'https://phimimg.com' };
}

// ================= XỬ LÝ CATALOG =================
async function handleCatalog(req, res) {
    const { type, id } = req.params;
    const rawExtra = req.params.extra || '';
    let search = req.query.search || null;
    let skip = parseInt(req.query.skip) || 0;

    if (rawExtra) {
        const params = new URLSearchParams(rawExtra);
        if (params.get('search')) search = params.get('search');
        if (params.get('skip')) skip = parseInt(params.get('skip')) || 0;
    }

    const page = Math.floor(skip / 10) + 1;
    const isMovie = id.includes('movie') || type === 'movie';
    let metas = [];

    try {
        if (id.startsWith('nguonc_')) {
            const urls = search
                ? [`${NGUONC_API}/films/search?keyword=${encodeURIComponent(search)}`]
                : [
                    isMovie
                        ? `${NGUONC_API}/films/danh-sach/phim-le?page=${page}`
                        : `${NGUONC_API}/films/danh-sach/phim-bo?page=${page}`,
                    `${NGUONC_API}/films/phim-moi-cap-nhat?page=${page}`
                ];

            for (const u of urls) {
                const data = await safeFetchJson(u);
                if (data?.items?.length > 0) {
                    metas = data.items.map(item => ({
                        id: `nguonc:${item.slug}`,
                        type: type,
                        name: item.name,
                        poster: item.thumb_url || item.poster_url,
                        background: item.poster_url || item.thumb_url,
                        description: `[🔥 NguonC] Tên gốc: ${item.original_name || item.name}\nTrạng thái: ${item.current_episode || 'Full'} (${item.quality || 'HD'} - ${item.language || 'Vietsub'})`
                    }));
                    break;
                }
            }
        } else if (id.startsWith('kkphim_')) {
            const { items, imgDomain } = await fetchCmsCatalogItems(KKPHIM_API, isMovie, page, search);
            metas = items.map(item => ({
                id: `kkphim:${item.slug}`,
                type: type,
                name: item.name,
                poster: fixImageUrl(item.poster_url || item.thumb_url, imgDomain),
                background: fixImageUrl(item.thumb_url || item.poster_url, imgDomain),
                description: `[⚡ KKPhim] Tên gốc: ${item.origin_name || item.name}\nNăm: ${item.year || ''}`
            }));
        } else if (id.startsWith('ophim_')) {
            const { items, imgDomain } = await fetchCmsCatalogItems(OPHIM_API, isMovie, page, search);
            metas = items.map(item => ({
                id: `ophim:${item.slug}`,
                type: type,
                name: item.name,
                poster: fixImageUrl(item.thumb_url || item.poster_url, imgDomain),
                background: fixImageUrl(item.poster_url || item.thumb_url, imgDomain),
                description: `[🎬 OPhim] Tên gốc: ${item.origin_name || item.name}\nNăm: ${item.year || ''}`
            }));
        }
    } catch (err) {}

    res.json({ metas });
}

app.get('/catalog/:type/:id.json', handleCatalog);
app.get('/catalog/:type/:id/:extra.json', handleCatalog);
app.get('/:source(nguonc|kkphim|ophim)/catalog/:type/:id.json', handleCatalog);
app.get('/:source(nguonc|kkphim|ophim)/catalog/:type/:id/:extra.json', handleCatalog);

// ================= XỬ LÝ META =================
async function handleMeta(req, res) {
    const { type } = req.params;
    const rawId = decodeURIComponent(req.params.id);
    const [prefix, slug] = rawId.split(':');

    if (!slug) return res.json({ meta: null });

    try {
        if (prefix === 'nguonc') {
            const data = await safeFetchJson(`${NGUONC_API}/film/${slug}`);
            const movie = data?.movie;
            if (!movie) return res.json({ meta: null });

            const meta = {
                id: `nguonc:${movie.slug}`,
                type: type,
                name: movie.name,
                poster: movie.thumb_url,
                background: movie.poster_url || movie.thumb_url,
                description: `${movie.description || ''}\n\nTên gốc: ${movie.original_name || ''}\nChất lượng: ${movie.quality || 'HD'} - ${movie.language || 'Vietsub'}`,
                releaseInfo: movie.current_episode || ''
            };

            if (type === 'series' && movie.episodes?.length > 0) {
                const epMap = new Map();
                movie.episodes.forEach(server => {
                    (server.items || []).forEach((ep, idx) => {
                        const epNum = idx + 1;
                        if (!epMap.has(epNum)) {
                            epMap.set(epNum, {
                                id: `nguonc:${movie.slug}:${epNum}`,
                                title: `Tập ${ep.name}`,
                                season: 1,
                                episode: epNum
                            });
                        }
                    });
                });
                meta.videos = Array.from(epMap.values());
            }
            return res.json({ meta });
        }

        if (prefix === 'kkphim' || prefix === 'ophim') {
            const baseApi = prefix === 'kkphim' ? KKPHIM_API : OPHIM_API;
            const data = await safeFetchJson(`${baseApi}/phim/${slug}`);
            const movie = data?.movie;
            if (!movie) return res.json({ meta: null });

            const meta = {
                id: `${prefix}:${movie.slug}`,
                type: type,
                name: movie.name,
                poster: movie.poster_url || movie.thumb_url,
                background: movie.thumb_url || movie.poster_url,
                description: `${(movie.content || '').replace(/<[^>]*>?/gm, '')}\n\nTên gốc: ${movie.origin_name || ''}\nChất lượng: ${movie.quality || 'HD'} - ${movie.lang || 'Vietsub'}`,
                releaseInfo: `${movie.year || ''} - ${movie.episode_current || ''}`
            };

            if (type === 'series' && Array.isArray(data.episodes)) {
                const epMap = new Map();
                data.episodes.forEach(server => {
                    (server.server_data || []).forEach((ep, idx) => {
                        const epNum = idx + 1;
                        if (!epMap.has(epNum)) {
                            epMap.set(epNum, {
                                id: `${prefix}:${movie.slug}:${epNum}`,
                                title: `Tập ${ep.name}`,
                                season: 1,
                                episode: epNum
                            });
                        }
                    });
                });
                meta.videos = Array.from(epMap.values());
            }
            return res.json({ meta });
        }
    } catch (e) {}

    res.json({ meta: null });
}

app.get('/meta/:type/:id.json', handleMeta);
app.get('/:source(nguonc|kkphim|ophim)/meta/:type/:id.json', handleMeta);

// ================= TÌM & LẤY LINK STREAM =================
async function searchNguonCSlug(keywords) {
    for (const kw of keywords) {
        const data = await safeFetchJson(`${NGUONC_API}/films/search?keyword=${encodeURIComponent(kw)}`);
        if (data?.items?.length) {
            const normKw = normalizeStr(kw);
            const matched = data.items.find(i =>
                normalizeStr(i.original_name).includes(normKw) ||
                normalizeStr(i.name).includes(normKw)
            ) || data.items[0];
            return matched.slug;
        }
    }
    return null;
}

async function searchCmsSlug(baseUrl, keywords) {
    for (const kw of keywords) {
        const data = await safeFetchJson(`${baseUrl}/v1/api/tim-kiem?keyword=${encodeURIComponent(kw)}&limit=10`);
        const items = data?.data?.items || data?.items || [];
        if (items.length) {
            const normKw = normalizeStr(kw);
            const matched = items.find(i =>
                normalizeStr(i.origin_name).includes(normKw) ||
                normalizeStr(i.name).includes(normKw)
            ) || items[0];
            return { slug: matched.slug, viName: matched.name, enName: matched.origin_name };
        }
    }
    return null;
}

function matchEpisode(items, targetEpNum) {
    if (!items || !items.length) return null;
    if (targetEpNum === null) return items[0];
    return items.find((item, idx) => {
        const num = parseInt((item.name || item.slug || '').replace(/\D/g, ''));
        return num === targetEpNum || (idx + 1) === targetEpNum;
    }) || items[targetEpNum - 1] || null;
}

async function fetchNguonCStreams(slug, keywords, targetEpNum) {
    const targetSlug = slug || await searchNguonCSlug(keywords);
    if (!targetSlug) return [];

    const detail = await safeFetchJson(`${NGUONC_API}/film/${targetSlug}`);
    const movie = detail?.movie;
    if (!movie?.episodes) return [];

    const streams = [];
    for (const server of movie.episodes) {
        const ep = matchEpisode(server.items, targetEpNum);
        if (ep && ep.m3u8) {
            streams.push({
                name: `🔥 NguonC\n${server.server_name || 'VIP'}`,
                title: `🔥 [NguonC] ${movie.name} - Tập ${ep.name}\n[${movie.quality || 'FHD'} - ${movie.language || 'Vietsub'}]`,
                url: ep.m3u8,
                behaviorHints: { notWebReady: false }
            });
        }
    }
    return streams;
}

async function fetchCmsStreams(label, icon, baseUrl, slug, keywords, targetEpNum) {
    let targetSlug = slug;
    if (!targetSlug) {
        const found = await searchCmsSlug(baseUrl, keywords);
        targetSlug = found?.slug;
    }
    if (!targetSlug) return [];

    const detail = await safeFetchJson(`${baseUrl}/phim/${targetSlug}`);
    const movie = detail?.movie;
    const episodes = detail?.episodes;
    if (!movie || !Array.isArray(episodes)) return [];

    const streams = [];
    for (const server of episodes) {
        const ep = matchEpisode(server.server_data, targetEpNum);
        if (ep && ep.link_m3u8) {
            streams.push({
                name: `${icon} ${label}\n${server.server_name || 'VIP'}`,
                title: `${icon} [${label}] ${movie.name} - Tập ${ep.name}\n[${movie.quality || 'FHD'} - ${movie.lang || 'Vietsub'}]`,
                url: ep.link_m3u8,
                behaviorHints: { notWebReady: false }
            });
        }
    }
    return streams;
}

async function handleStream(req, res) {
    const { type, source } = req.params;
    const activeSource = source || 'all';
    const rawId = decodeURIComponent(req.params.id);
    const parts = rawId.split(':');
    const prefix = parts[0];

    let targetEpNum = null;
    let keywords = [];
    let nguoncSlug = null;
    let kkphimSlug = null;
    let ophimSlug = null;

    try {
        if (prefix.startsWith('tt')) {
            const imdbId = parts[0];
            targetEpNum = parts[2] ? parseInt(parts[2]) : (type === 'series' ? 1 : null);
            const cinemeta = await safeFetchJson(`${CINEMETA_API}/${type}/${imdbId}.json`);
            keywords = buildKeywords(cinemeta?.meta?.name || '');

            const foundKk = await searchCmsSlug(KKPHIM_API, keywords);
            if (foundKk) {
                kkphimSlug = foundKk.slug;
                keywords = Array.from(new Set([...keywords, ...buildKeywords(foundKk.viName), ...buildKeywords(foundKk.enName)]));
            }
        } else {
            const slug = parts[1];
            targetEpNum = parts[2] ? parseInt(parts[2]) : (type === 'series' ? 1 : null);

            if (prefix === 'nguonc') {
                nguoncSlug = slug;
                const d = await safeFetchJson(`${NGUONC_API}/film/${slug}`);
                keywords = [...buildKeywords(d?.movie?.original_name), ...buildKeywords(d?.movie?.name)];
            } else if (prefix === 'kkphim') {
                kkphimSlug = slug;
                const d = await safeFetchJson(`${KKPHIM_API}/phim/${slug}`);
                keywords = [...buildKeywords(d?.movie?.origin_name), ...buildKeywords(d?.movie?.name)];
            } else if (prefix === 'ophim') {
                ophimSlug = slug;
                const d = await safeFetchJson(`${OPHIM_API}/phim/${slug}`);
                keywords = [...buildKeywords(d?.movie?.origin_name), ...buildKeywords(d?.movie?.name)];
            }
        }

        const tasks = [];
        if (activeSource === 'all' || activeSource === 'nguonc') {
            tasks.push(fetchNguonCStreams(nguoncSlug, keywords, targetEpNum));
        }
        if (activeSource === 'all' || activeSource === 'kkphim') {
            tasks.push(fetchCmsStreams('KKPhim', '⚡', KKPHIM_API, kkphimSlug, keywords, targetEpNum));
        }
        if (activeSource === 'all' || activeSource === 'ophim') {
            tasks.push(fetchCmsStreams('OPhim', '🎬', OPHIM_API, ophimSlug, keywords, targetEpNum));
        }

        const results = await Promise.all(tasks);
        res.json({ streams: results.flat() });
    } catch (err) {
        res.json({ streams: [] });
    }
}

app.get('/stream/:type/:id.json', handleStream);
app.get('/:source(nguonc|kkphim|ophim)/stream/:type/:id.json', handleStream);

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Server v3.2 chạy tại: http://localhost:${PORT}`));
}

module.exports = app;

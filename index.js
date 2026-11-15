const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());

const NGUONC_API = 'https://phim.nguonc.com/api';
const KKPHIM_API = 'https://phimapi.com';
const OPHIM_APIS = ['https://ophim1.com', 'https://ophim17.cc', 'https://ophim1.cc'];
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
            prefixes: ['nguonc:', 'kkphim:', 'tt']
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
        version: '3.3.0',
        name: cfg.name,
        description: cfg.desc,
        logo: 'https://phim.nguonc.com/public/images/Logo/logonguonc.png',
        resources: ['catalog', 'meta', 'stream'],
        types: ['movie', 'series'],
        idPrefixes: cfg.prefixes,
        catalogs
    };
}

// Hàm tải 1 URL đơn lẻ có kiểm tra JSON hợp lệ
async function fetchSingleJson(targetUrl, timeoutMs = 4500, extraHeaders = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
                ...extraHeaders
            }
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) throw new Error('HTML blocked');

        const parsed = JSON.parse(text);
        // Nếu dùng allorigins/get thì dữ liệu nằm trong parsed.contents
        if (parsed && typeof parsed.contents === 'string') {
            const inner = JSON.parse(parsed.contents);
            if (inner) return inner;
        }
        if (parsed) return parsed;
        throw new Error('Empty JSON');
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

// Hàm tải thông minh: Chạy đua song song nhiều cổng Proxy cùng lúc để lấy kết quả nhanh nhất (< 3 giây)
async function safeFetchJson(url, timeoutMs = 4500) {
    const isNguonC = url.includes('nguonc.com');

    if (!isNguonC) {
        try {
            return await fetchSingleJson(url, timeoutMs);
        } catch (e) {
            return null;
        }
    }

    // Chạy đua đồng thời 4 đường truyền để vượt tường lửa NguonC mà không bị timeout trên Vercel
    const candidates = [
        fetchSingleJson(url, 3500, { 'Referer': 'https://phim.nguonc.com/' }),
        fetchSingleJson(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, 4500),
        fetchSingleJson(`https://corsproxy.io/?${encodeURIComponent(url)}`, 4500),
        fetchSingleJson(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, 4500)
    ];

    try {
        return await Promise.any(candidates);
    } catch (e) {
        return null;
    }
}

// Hàm gọi OPhim tự động thử các tên miền dự phòng
async function fetchOPhimJson(pathWithSlash) {
    const candidates = OPHIM_APIS.map(domain =>
        fetchSingleJson(`${domain}${pathWithSlash}`, 4500)
    );
    try {
        return await Promise.any(candidates);
    } catch (e) {
        return null;
    }
}

app.get('/', (req, res) => {
    const host = req.headers['x-forwarded-proto']
        ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
        : `http://${req.headers.host}`;
    res.send(`
        <div style="font-family: sans-serif; max-width: 650px; margin: 20px auto; padding: 20px; border: 1px solid #ccc; border-radius: 10px;">
            <h2>🎬 Server Addon Nuvio v3.3 (Fast Race Mode)</h2>
            <p><a href="/debug" target="_blank" style="color: white; background: #2a9d8f; padding: 10px 16px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">🔍 Bấm kiểm tra lại /debug (v3.3)</a></p>
            <hr>
            <p>🔥 NguonC:<br><input value="${host}/nguonc/manifest.json" style="width:100%;padding:8px;" readonly onclick="this.select()"></p>
            <p>⚡ KKPhim:<br><input value="${host}/kkphim/manifest.json" style="width:100%;padding:8px;" readonly onclick="this.select()"></p>
            <p>🎬 OPhim:<br><input value="${host}/ophim/manifest.json" style="width:100%;padding:8px;" readonly onclick="this.select()"></p>
            <hr>
            <p>Gộp 3 trong 1:<br><input value="${host}/manifest.json" style="width:100%;padding:8px;" readonly onclick="this.select()"></p>
        </div>
    `);
});

// Endpoint kiểm tra kết nối cả 3 nguồn
app.get('/debug', async (req, res) => {
    const [nguonc, kkphim, ophim] = await Promise.all([
        safeFetchJson(`${NGUONC_API}/films/phim-moi-cap-nhat?page=1`),
        safeFetchJson(`${KKPHIM_API}/danh-sach/phim-moi-cap-nhat?page=1`),
        fetchOPhimJson(`/v1/api/danh-sach/phim-moi-cap-nhat?page=1`)
    ]);

    const nguoncItems = nguonc?.items || [];
    const kkItems = kkphim?.items || kkphim?.data?.items || [];
    const opItems = ophim?.data?.items || ophim?.items || [];

    res.json({
        version: '3.3.0',
        status: 'Kiểm tra kết nối 3 nguồn (Chạy đua song song)',
        nguonc_ok: nguoncItems.length > 0,
        nguonc_count: nguoncItems.length,
        nguonc_sample: nguoncItems[0]?.name || 'Đang dùng luồng dự phòng tự động',
        kkphim_ok: kkItems.length > 0,
        kkphim_count: kkItems.length,
        kkphim_sample: kkItems[0]?.name || null,
        ophim_ok: opItems.length > 0,
        ophim_count: opItems.length,
        ophim_sample: opItems[0]?.name || null
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

async function fetchKKPhimCatalog(isMovie, page, search) {
    const path = search
        ? `/v1/api/tim-kiem?keyword=${encodeURIComponent(search)}&limit=20`
        : `/v1/api/danh-sach/${isMovie ? 'phim-le' : 'phim-bo'}?page=${page}&limit=20`;

    let data = await safeFetchJson(`${KKPHIM_API}${path}`);
    let items = data?.data?.items || data?.items || [];
    if (!items.length && !search) {
        data = await safeFetchJson(`${KKPHIM_API}/danh-sach/phim-moi-cap-nhat?page=${page}`);
        items = data?.items || [];
    }
    const imgDomain = data?.data?.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';
    return { items, imgDomain };
}

async function fetchOPhimCatalog(isMovie, page, search) {
    const path = search
        ? `/v1/api/tim-kiem?keyword=${encodeURIComponent(search)}&limit=20`
        : `/v1/api/danh-sach/${isMovie ? 'phim-le' : 'phim-bo'}?page=${page}&limit=20`;

    let data = await fetchOPhimJson(path);
    let items = data?.data?.items || data?.items || [];
    if (!items.length && !search) {
        data = await fetchOPhimJson(`/v1/api/danh-sach/phim-moi-cap-nhat?page=${page}`);
        items = data?.data?.items || data?.items || [];
    }
    const imgDomain = data?.data?.APP_DOMAIN_CDN_IMAGE || 'https://img.ophim.live/uploads/movies';
    return { items, imgDomain };
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
            const url = search
                ? `${NGUONC_API}/films/search?keyword=${encodeURIComponent(search)}`
                : isMovie
                    ? `${NGUONC_API}/films/danh-sach/phim-le?page=${page}`
                    : `${NGUONC_API}/films/danh-sach/phim-bo?page=${page}`;

            const data = await safeFetchJson(url);
            if (data?.items?.length > 0) {
                metas = data.items.map(item => ({
                    id: `nguonc:${item.slug}`,
                    type: type,
                    name: item.name,
                    poster: item.thumb_url || item.poster_url,
                    background: item.poster_url || item.thumb_url,
                    description: `[🔥 NguonC] Tên gốc: ${item.original_name || item.name}\nTrạng thái: ${item.current_episode || 'Full'} (${item.quality || 'HD'} - ${item.language || 'Vietsub'})`
                }));
            }

            // Nếu toàn bộ proxy bị NguonC chặn, tự động lấy danh mục dự phòng để không bao giờ báo lỗi trống
            if (metas.length === 0) {
                const fb = await fetchOPhimCatalog(isMovie, page, search);
                const fb2 = fb.items.length ? fb : await fetchKKPhimCatalog(isMovie, page, search);
                const prefix = fb.items.length ? 'ophim' : 'kkphim';
                metas = fb2.items.map(item => ({
                    id: `${prefix}:${item.slug}`,
                    type: type,
                    name: item.name,
                    poster: fixImageUrl(item.thumb_url || item.poster_url, fb2.imgDomain),
                    background: fixImageUrl(item.poster_url || item.thumb_url, fb2.imgDomain),
                    description: `[🔥 NguonC Mirror] Tên gốc: ${item.origin_name || item.name}\nNăm: ${item.year || ''}`
                }));
            }
        } else if (id.startsWith('kkphim_')) {
            const { items, imgDomain } = await fetchKKPhimCatalog(isMovie, page, search);
            metas = items.map(item => ({
                id: `kkphim:${item.slug}`,
                type: type,
                name: item.name,
                poster: fixImageUrl(item.poster_url || item.thumb_url, imgDomain),
                background: fixImageUrl(item.thumb_url || item.poster_url, imgDomain),
                description: `[⚡ KKPhim] Tên gốc: ${item.origin_name || item.name}\nNăm: ${item.year || ''}`
            }));
        } else if (id.startsWith('ophim_')) {
            const { items, imgDomain } = await fetchOPhimCatalog(isMovie, page, search);
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
            const data = prefix === 'kkphim'
                ? await safeFetchJson(`${KKPHIM_API}/phim/${slug}`)
                : (await fetchOPhimJson(`/phim/${slug}`)) || (await fetchOPhimJson(`/v1/api/phim/${slug}`));

            const movie = data?.movie || data?.data?.item;
            const episodes = data?.episodes || data?.data?.item?.episodes || [];
            if (!movie) return res.json({ meta: null });

            const imgDomain = data?.data?.APP_DOMAIN_CDN_IMAGE || (prefix === 'ophim' ? 'https://img.ophim.live/uploads/movies' : 'https://phimimg.com');

            const meta = {
                id: `${prefix}:${movie.slug}`,
                type: type,
                name: movie.name,
                poster: fixImageUrl(movie.poster_url || movie.thumb_url, imgDomain),
                background: fixImageUrl(movie.thumb_url || movie.poster_url, imgDomain),
                description: `${(movie.content || '').replace(/<[^>]*>?/gm, '')}\n\nTên gốc: ${movie.origin_name || ''}\nChất lượng: ${movie.quality || 'HD'} - ${movie.lang || 'Vietsub'}`,
                releaseInfo: `${movie.year || ''} - ${movie.episode_current || ''}`
            };

            if (type === 'series' && Array.isArray(episodes)) {
                const epMap = new Map();
                episodes.forEach(server => {
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
    for (const kw of keywords.slice(0, 2)) {
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

async function searchCmsSlug(isOPhim, keywords) {
    for (const kw of keywords.slice(0, 2)) {
        const path = `/v1/api/tim-kiem?keyword=${encodeURIComponent(kw)}&limit=10`;
        const data = isOPhim ? await fetchOPhimJson(path) : await safeFetchJson(`${KKPHIM_API}${path}`);
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

async function fetchCmsStreams(label, icon, isOPhim, slug, keywords, targetEpNum) {
    let targetSlug = slug;
    if (!targetSlug) {
        const found = await searchCmsSlug(isOPhim, keywords);
        targetSlug = found?.slug;
    }
    if (!targetSlug) return [];

    const detail = isOPhim
        ? (await fetchOPhimJson(`/phim/${targetSlug}`)) || (await fetchOPhimJson(`/v1/api/phim/${targetSlug}`))
        : await safeFetchJson(`${KKPHIM_API}/phim/${targetSlug}`);

    const movie = detail?.movie || detail?.data?.item;
    const episodes = detail?.episodes || detail?.data?.item?.episodes;
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

            const foundKk = await searchCmsSlug(false, keywords);
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
                const d = await fetchOPhimJson(`/phim/${slug}`);
                const m = d?.movie || d?.data?.item;
                keywords = [...buildKeywords(m?.origin_name), ...buildKeywords(m?.name)];
            }
        }

        const tasks = [];
        if (activeSource === 'all' || activeSource === 'nguonc') {
            tasks.push(fetchNguonCStreams(nguoncSlug, keywords, targetEpNum));
        }
        if (activeSource === 'all' || activeSource === 'kkphim') {
            tasks.push(fetchCmsStreams('KKPhim', '⚡', false, kkphimSlug, keywords, targetEpNum));
        }
        if (activeSource === 'all' || activeSource === 'ophim') {
            tasks.push(fetchCmsStreams('OPhim', '🎬', true, ophimSlug, keywords, targetEpNum));
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
    app.listen(PORT, () => console.log(`Server v3.3 chạy tại: http://localhost:${PORT}`));
}

module.exports = app;

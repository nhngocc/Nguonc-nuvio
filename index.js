const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());

const KKPHIM_API = 'https://phimapi.com';
const CINEMETA_API = 'https://v3-cinemeta.strem.io/meta';

function createManifest(source = 'all') {
    return {
        id: 'com.nuvio.vn.kkphim.pro',
        version: '3.4.0',
        name: '⚡ VN Phim (KKPhim Pro)',
        description: 'Kho phim Vietsub, Thuyết minh tốc độ cao, không giật lag cho Nuvio',
        logo: 'https://phimimg.com/upload/vod/logo.png',
        resources: ['catalog', 'meta', 'stream'],
        types: ['movie', 'series'],
        idPrefixes: ['kkphim:', 'tt'],
        catalogs: [
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
            },
            {
                type: 'series',
                id: 'kkphim_cartoon',
                name: '⚡ KKPhim - Hoạt Hình / Anime',
                extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
            }
        ]
    };
}

async function safeFetchJson(url) {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

app.get('/', (req, res) => {
    const host = req.headers['x-forwarded-proto']
        ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
        : `http://${req.headers.host}`;
    res.send(`
        <div style="font-family: sans-serif; max-width: 600px; margin: 30px auto; padding: 20px; border: 1px solid #ccc; border-radius: 10px;">
            <h2>⚡ KKPhim Pro Addon cho Nuvio</h2>
            <p>Link Manifest cài đặt:</p>
            <input value="${host}/manifest.json" style="width:100%;padding:10px;font-size:16px;" readonly onclick="this.select()">
        </div>
    `);
});

app.get('/manifest.json', (req, res) => res.json(createManifest()));

function fixImageUrl(url, domain = '') {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${domain.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

function normalizeStr(str = '') {
    return str.toLowerCase().replace(/[:\-–—_.,!?'"]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildKeywords(rawTitle = '') {
    if (!rawTitle) return [];
    const spaced = rawTitle.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    const clean = spaced.split(/[:\-–]/)[0].trim();
    return Array.from(new Set([rawTitle.trim(), spaced, clean])).filter(Boolean);
}

// ================= CATALOG =================
app.get('/catalog/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    const rawExtra = req.params.extra || '';
    let search = req.query.search || null;
    let skip = parseInt(req.query.skip) || 0;

    if (rawExtra) {
        const params = new URLSearchParams(rawExtra);
        if (params.get('search')) search = params.get('search');
        if (params.get('skip')) skip = parseInt(params.get('skip')) || 0;
    }

    const page = Math.floor(skip / 20) + 1;
    let url = '';

    if (search) {
        url = `${KKPHIM_API}/v1/api/tim-kiem?keyword=${encodeURIComponent(search)}&limit=24`;
    } else if (id === 'kkphim_movie') {
        url = `${KKPHIM_API}/v1/api/danh-sach/phim-le?page=${page}&limit=24`;
    } else if (id === 'kkphim_series') {
        url = `${KKPHIM_API}/v1/api/danh-sach/phim-bo?page=${page}&limit=24`;
    } else if (id === 'kkphim_cartoon') {
        url = `${KKPHIM_API}/v1/api/danh-sach/hoat-hinh?page=${page}&limit=24`;
    } else {
        url = `${KKPHIM_API}/danh-sach/phim-moi-cap-nhat?page=${page}`;
    }

    const data = await safeFetchJson(url);
    const items = data?.data?.items || data?.items || [];
    const imgDomain = data?.data?.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';

    const metas = items.map(item => ({
        id: `kkphim:${item.slug}`,
        type: type,
        name: item.name,
        poster: fixImageUrl(item.poster_url || item.thumb_url, imgDomain),
        background: fixImageUrl(item.thumb_url || item.poster_url, imgDomain),
        description: `[⚡ KKPhim] Tên gốc: ${item.origin_name || item.name}\nTrạng thái: ${item.episode_current || 'Full'} (${item.quality || 'HD'} - ${item.lang || 'Vietsub'})\nNăm: ${item.year || ''}`
    }));

    res.json({ metas });
});

// ================= META =================
app.get('/meta/:type/:id.json', async (req, res) => {
    const { type } = req.params;
    const rawId = decodeURIComponent(req.params.id);
    const [prefix, slug] = rawId.split(':');

    if (!slug) return res.json({ meta: null });

    const data = await safeFetchJson(`${KKPHIM_API}/phim/${slug}`);
    const movie = data?.movie;
    if (!movie) return res.json({ meta: null });

    const imgDomain = data?.data?.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';

    const meta = {
        id: `kkphim:${movie.slug}`,
        type: type,
        name: movie.name,
        poster: fixImageUrl(movie.poster_url || movie.thumb_url, imgDomain),
        background: fixImageUrl(movie.thumb_url || movie.poster_url, imgDomain),
        description: `${(movie.content || '').replace(/<[^>]*>?/gm, '')}\n\nTên gốc: ${movie.origin_name || ''}\nĐạo diễn: ${movie.director?.join(', ') || 'Đang cập nhật'}\nDiễn viên: ${movie.actor?.join(', ') || 'Đang cập nhật'}\nChất lượng: ${movie.quality || 'HD'} - ${movie.lang || 'Vietsub'}`,
        releaseInfo: `${movie.year || ''} - ${movie.episode_current || ''}`
    };

    if (type === 'series' && Array.isArray(data.episodes)) {
        const epMap = new Map();
        data.episodes.forEach(server => {
            (server.server_data || []).forEach((ep, idx) => {
                const epNum = idx + 1;
                if (!epMap.has(epNum)) {
                    epMap.set(epNum, {
                        id: `kkphim:${movie.slug}:${epNum}`,
                        title: `Tập ${ep.name}`,
                        season: 1,
                        episode: epNum
                    });
                }
            });
        });
        meta.videos = Array.from(epMap.values());
    }

    res.json({ meta });
});

// ================= STREAM =================
async function searchCmsSlug(keywords) {
    for (const kw of keywords) {
        const data = await safeFetchJson(`${KKPHIM_API}/v1/api/tim-kiem?keyword=${encodeURIComponent(kw)}&limit=10`);
        const items = data?.data?.items || data?.items || [];
        if (items.length) {
            const normKw = normalizeStr(kw);
            const matched = items.find(i =>
                normalizeStr(i.origin_name).includes(normKw) ||
                normalizeStr(i.name).includes(normKw)
            ) || items[0];
            return matched.slug;
        }
    }
    return null;
}

app.get('/stream/:type/:id.json', async (req, res) => {
    const { type } = req.params;
    const rawId = decodeURIComponent(req.params.id);
    const parts = rawId.split(':');
    const prefix = parts[0];

    let targetEpNum = null;
    let keywords = [];
    let targetSlug = null;

    try {
        if (prefix.startsWith('tt')) {
            const imdbId = parts[0];
            targetEpNum = parts[2] ? parseInt(parts[2]) : (type === 'series' ? 1 : null);
            const cinemeta = await safeFetchJson(`${CINEMETA_API}/${type}/${imdbId}.json`);
            keywords = buildKeywords(cinemeta?.meta?.name || '');
        } else {
            targetSlug = parts[1];
            targetEpNum = parts[2] ? parseInt(parts[2]) : (type === 'series' ? 1 : null);
            const d = await safeFetchJson(`${KKPHIM_API}/phim/${targetSlug}`);
            const m = d?.movie;
            if (m) keywords = [...buildKeywords(m.origin_name), ...buildKeywords(m.name)];
        }

        if (!targetSlug && keywords.length > 0) {
            targetSlug = await searchCmsSlug(keywords);
        }

        if (!targetSlug) return res.json({ streams: [] });

        const detail = await safeFetchJson(`${KKPHIM_API}/phim/${targetSlug}`);
        const movie = detail?.movie;
        const episodes = detail?.episodes;
        if (!movie || !Array.isArray(episodes)) return res.json({ streams: [] });

        const streams = [];
        for (const server of episodes) {
            const items = server.server_data || [];
            let ep = items[0];
            if (targetEpNum !== null) {
                ep = items.find((item, idx) => {
                    const num = parseInt((item.name || item.slug || '').replace(/\D/g, ''));
                    return num === targetEpNum || (idx + 1) === targetEpNum;
                }) || items[targetEpNum - 1];
            }

            if (ep && ep.link_m3u8) {
                streams.push({
                    name: `⚡ KKPhim\n${server.server_name || 'VIP'}`,
                    title: `⚡ [KKPhim] ${movie.name} - Tập ${ep.name}\n[${movie.quality || 'FHD'} - ${movie.lang || 'Vietsub'}]`,
                    url: ep.link_m3u8,
                    behaviorHints: { notWebReady: false }
                });
            }
        }

        res.json({ streams });
    } catch (err) {
        res.json({ streams: [] });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Server chạy tại: http://localhost:${PORT}`));
}

module.exports = app;

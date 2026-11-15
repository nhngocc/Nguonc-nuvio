const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());

const NGUONC_API = 'https://phim.nguonc.com/api';
const KKPHIM_API = 'https://phimapi.com';
const OPHIM_API = 'https://ophim1.com';
const CINEMETA_API = 'https://v3-cinemeta.strem.io/meta';

// 1. Manifest tích hợp cả 3 nguồn: NguonC + KKPhim + OPhim
const manifest = {
    id: 'com.nuvio.vn.allinone',
    version: '2.0.0',
    name: 'VN Phim All-in-One (NguonC + KKPhim + OPhim)',
    description: 'Tổng hợp nguồn phim Vietsub, Thuyết minh, Lồng tiếng từ 3 kho lớn nhất: NguonC, KKPhim và OPhim',
    logo: 'https://phim.nguonc.com/public/images/Logo/logonguonc.png',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['nguonc:', 'kkphim:', 'ophim:', 'tt'],
    catalogs: [
        {
            type: 'movie',
            id: 'nguonc_moi',
            name: '🔥 NguonC - Mới Cập Nhật',
            extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'kkphim_moi',
            name: '⚡ KKPhim - Mới Cập Nhật',
            extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'ophim_moi',
            name: '🎬 OPhim - Mới Cập Nhật',
            extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'vn_phim_le',
            name: '🍿 Phim Lẻ Tổng Hợp',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'vn_phim_bo',
            name: '📺 Phim Bộ Tổng Hợp',
            extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
        }
    ]
};

app.get('/', (req, res) => {
    const host = req.headers['x-forwarded-proto']
        ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
        : `http://${req.headers.host}`;
    res.send(`
        <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2>🚀 Addon VN Phim 3-trong-1 (NguonC + KKPhim + OPhim)</h2>
            <p>Link Manifest cài đặt cho Nuvio:</p>
            <input type="text" value="${host}/manifest.json" style="width: 100%; padding: 10px; font-size: 16px; margin-bottom: 15px;" readonly onclick="this.select()" />
        </div>
    `);
});

app.get('/manifest.json', (req, res) => {
    res.json(manifest);
});

// Chuẩn hóa ảnh poster của KKPhim và OPhim
function fixImageUrl(url, domain = '') {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${domain}/${url.replace(/^\/+/, '')}`;
}

// Hàm phụ: Tải JSON an toàn có timeout
async function safeFetchJson(url, timeoutMs = 6000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        clearTimeout(timer);
        return null;
    }
}

// ================= 2. XỬ LÝ CATALOG & TÌM KIẾM =================
async function handleCatalog(req, res) {
    const { type, id, extra } = req.params;
    let search = null;
    let skip = 0;

    if (extra) {
        const params = new URLSearchParams(extra);
        if (params.get('search')) search = params.get('search');
        if (params.get('skip')) skip = parseInt(params.get('skip')) || 0;
    }

    const page = Math.floor(skip / 10) + 1;
    let metas = [];

    try {
        // A. NguonC Catalog / Search
        if (id === 'nguonc_moi' || id === 'vn_phim_le' || id === 'vn_phim_bo') {
            let url = `${NGUONC_API}/films/phim-moi-cap-nhat?page=${page}`;
            if (search) url = `${NGUONC_API}/films/search?keyword=${encodeURIComponent(search)}`;
            else if (id === 'vn_phim_le') url = `${NGUONC_API}/films/danh-sach/phim-le?page=${page}`;
            else if (id === 'vn_phim_bo') url = `${NGUONC_API}/films/danh-sach/phim-bo?page=${page}`;

            const data = await safeFetchJson(url);
            if (data && data.items) {
                metas = data.items.map(item => ({
                    id: `nguonc:${item.slug}`,
                    type: type,
                    name: item.name,
                    poster: item.thumb_url || item.poster_url,
                    background: item.poster_url || item.thumb_url,
                    description: `[NguonC] Tên gốc: ${item.original_name || item.name}\nTrạng thái: ${item.current_episode || 'Full'} (${item.quality || 'HD'} - ${item.language || 'Vietsub'})`
                }));
            }
        }
        // B. KKPhim Catalog / Search
        else if (id === 'kkphim_moi') {
            let url = search
                ? `${KKPHIM_API}/v1/api/tim-kiem?keyword=${encodeURIComponent(search)}&limit=15`
                : `${KKPHIM_API}/danh-sach/phim-moi-cap-nhat?page=${page}`;

            const data = await safeFetchJson(url);
            const items = data?.data?.items || data?.items || [];
            const imgDomain = data?.data?.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';

            metas = items.map(item => ({
                id: `kkphim:${item.slug}`,
                type: type,
                name: item.name,
                poster: fixImageUrl(item.poster_url || item.thumb_url, imgDomain),
                background: fixImageUrl(item.thumb_url || item.poster_url, imgDomain),
                description: `[KKPhim] Tên gốc: ${item.origin_name || item.name}\nNăm: ${item.year || ''}`
            }));
        }
        // C. OPhim Catalog / Search
        else if (id === 'ophim_moi') {
            let url = search
                ? `${OPHIM_API}/v1/api/tim-kiem?keyword=${encodeURIComponent(search)}&limit=15`
                : `${OPHIM_API}/danh-sach/phim-moi-cap-nhat?page=${page}`;

            const data = await safeFetchJson(url);
            const items = data?.data?.items || data?.items || [];
            const imgDomain = data?.data?.APP_DOMAIN_CDN_IMAGE || 'https://img.ophim.live/uploads/movies';

            metas = items.map(item => ({
                id: `ophim:${item.slug}`,
                type: type,
                name: item.name,
                poster: fixImageUrl(item.thumb_url || item.poster_url, imgDomain),
                background: fixImageUrl(item.poster_url || item.thumb_url, imgDomain),
                description: `[OPhim] Tên gốc: ${item.origin_name || item.name}\nNăm: ${item.year || ''}`
            }));
        }
    } catch (err) {
        console.error('Lỗi Catalog:', err.message);
    }

    res.json({ metas });
}

app.get('/catalog/:type/:id.json', handleCatalog);
app.get('/catalog/:type/:id/:extra.json', handleCatalog);

// ================= 3. XỬ LÝ META (CHI TIẾT PHIM & DANH SÁCH TẬP) =================
app.get('/meta/:type/:id.json', async (req, res) => {
    const { type } = req.params;
    const rawId = decodeURIComponent(req.params.id);
    const [prefix, slug] = rawId.split(':');

    if (!slug) return res.json({ meta: null });

    try {
        // A. Chi tiết phim từ NguonC
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

        // B. Chi tiết phim từ KKPhim hoặc OPhim (Cấu trúc giống nhau)
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

            if (type === 'series' && Array.isArray(data.episodes) && data.episodes.length > 0) {
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
    } catch (err) {
        console.error('Lỗi Meta:', err.message);
    }

    res.json({ meta: null });
});

// ================= 4. CÁC HÀM QUÉT STREAM TỪ 3 NGUỒN =================

// Quét link từ NguonC (theo slug hoặc theo từ khóa tìm kiếm)
async function getNguonCStreams(slug, keyword, targetEpNum) {
    try {
        let targetSlug = slug;
        if (!targetSlug && keyword) {
            const searchData = await safeFetchJson(`${NGUONC_API}/films/search?keyword=${encodeURIComponent(keyword)}`);
            if (!searchData?.items?.length) return [];
            const matched = searchData.items.find(i =>
                i.original_name?.toLowerCase() === keyword.toLowerCase() ||
                i.name?.toLowerCase() === keyword.toLowerCase()
            ) || searchData.items[0];
            targetSlug = matched.slug;
        }
        if (!targetSlug) return [];

        const detailData = await safeFetchJson(`${NGUONC_API}/film/${targetSlug}`);
        const movie = detailData?.movie;
        if (!movie?.episodes) return [];

        const streams = [];
        for (const server of movie.episodes) {
            const items = server.items || [];
            let ep = items[0];
            if (targetEpNum !== null) {
                ep = items.find((item, idx) => {
                    const num = parseInt(item.name.replace(/\D/g, ''));
                    return num === targetEpNum || (idx + 1) === targetEpNum;
                });
            }
            if (ep && ep.m3u8) {
                streams.push({
                    name: `🔥 NguonC\n${server.server_name || 'VIP'}`,
                    title: `${movie.name} - Tập ${ep.name}\n[${movie.quality || 'HD'} - ${movie.language || 'Vietsub'}]`,
                    url: ep.m3u8,
                    behaviorHints: { notWebReady: false }
                });
            }
        }
        return streams;
    } catch (e) {
        return [];
    }
}

// Quét link từ KKPhim hoặc OPhim
async function getCmsStreams(sourceName, baseUrl, slug, keyword, targetEpNum) {
    try {
        let targetSlug = slug;
        if (!targetSlug && keyword) {
            const searchData = await safeFetchJson(`${baseUrl}/v1/api/tim-kiem?keyword=${encodeURIComponent(keyword)}&limit=5`);
            const items = searchData?.data?.items || searchData?.items || [];
            if (!items.length) return [];
            const matched = items.find(i =>
                i.origin_name?.toLowerCase() === keyword.toLowerCase() ||
                i.name?.toLowerCase() === keyword.toLowerCase()
            ) || items[0];
            targetSlug = matched.slug;
        }
        if (!targetSlug) return [];

        const detailData = await safeFetchJson(`${baseUrl}/phim/${targetSlug}`);
        const movie = detailData?.movie;
        const episodes = detailData?.episodes;
        if (!movie || !Array.isArray(episodes)) return [];

        const streams = [];
        for (const server of episodes) {
            const items = server.server_data || [];
            let ep = items[0];
            if (targetEpNum !== null) {
                ep = items.find((item, idx) => {
                    const num = parseInt(item.name.replace(/\D/g, ''));
                    return num === targetEpNum || (idx + 1) === targetEpNum;
                });
            }
            if (ep && ep.link_m3u8) {
                streams.push({
                    name: `${sourceName}\n${server.server_name || 'VIP'}`,
                    title: `${movie.name} - Tập ${ep.name}\n[${movie.quality || 'HD'} - ${movie.lang || 'Vietsub'}]`,
                    url: ep.link_m3u8,
                    behaviorHints: { notWebReady: false }
                });
            }
        }
        return streams;
    } catch (e) {
        return [];
    }
}

// ================= 5. ENDPOINT TRẢ VỀ STREAM GỘP CẢ 3 NGUỒN =================
app.get('/stream/:type/:id.json', async (req, res) => {
    const { type } = req.params;
    const rawId = decodeURIComponent(req.params.id);
    const parts = rawId.split(':');
    const prefix = parts[0];

    let targetEpNum = null;
    let searchKeyword = null;
    let nguoncSlug = null;
    let kkphimSlug = null;
    let ophimSlug = null;

    try {
        // Trường hợp 1: Bấm từ phim mặc định của Nuvio (IMDb ID dạng tt1234567)
        if (prefix.startsWith('tt')) {
            const imdbId = parts[0];
            targetEpNum = parts[2] ? parseInt(parts[2]) : (type === 'series' ? 1 : null);
            const cinemeta = await safeFetchJson(`${CINEMETA_API}/${type}/${imdbId}.json`);
            searchKeyword = cinemeta?.meta?.name;
        }
        // Trường hợp 2: Bấm từ danh mục NguonC, KKPhim hoặc OPhim
        else {
            const slug = parts[1];
            targetEpNum = parts[2] ? parseInt(parts[2]) : (type === 'series' ? 1 : null);

            if (prefix === 'nguonc') {
                nguoncSlug = slug;
                const d = await safeFetchJson(`${NGUONC_API}/film/${slug}`);
                searchKeyword = d?.movie?.original_name || d?.movie?.name;
            } else if (prefix === 'kkphim') {
                kkphimSlug = slug;
                const d = await safeFetchJson(`${KKPHIM_API}/phim/${slug}`);
                searchKeyword = d?.movie?.origin_name || d?.movie?.name;
            } else if (prefix === 'ophim') {
                ophimSlug = slug;
                const d = await safeFetchJson(`${OPHIM_API}/phim/${slug}`);
                searchKeyword = d?.movie?.origin_name || d?.movie?.name;
            }
        }

        // Chạy song song cả 3 nguồn cùng lúc để lấy toàn bộ server cực nhanh
        const [nguoncStreams, kkphimStreams, ophimStreams] = await Promise.all([
            getNguonCStreams(nguoncSlug, searchKeyword, targetEpNum),
            getCmsStreams('⚡ KKPhim', KKPHIM_API, kkphimSlug, searchKeyword, targetEpNum),
            getCmsStreams('🎬 OPhim', OPHIM_API, ophimSlug, searchKeyword, targetEpNum)
        ]);

        const allStreams = [...nguoncStreams, ...kkphimStreams, ...ophimStreams];
        res.json({ streams: allStreams });
    } catch (err) {
        console.error('Lỗi Stream:', err.message);
        res.json({ streams: [] });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Addon 3-in-1 đã chạy tại: http://localhost:${PORT}/manifest.json`);
    });
}

module.exports = app;

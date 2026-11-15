const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());

const NGUONC_API = 'https://phim.nguonc.com/api';
const CINEMETA_API = 'https://v3-cinemeta.strem.io/meta';

// 1. Khai báo Manifest chuẩn riêng cho NguonC (Catalog danh mục + Tìm kiếm + Stream)
const manifest = {
    id: 'com.nuvio.nguonc.pro',
    version: '2.0.0',
    name: '🔥 NguonC Phim (Vietsub / Thuyết minh)',
    description: 'Addon xem phim trực tiếp từ kho dữ liệu phim.nguonc.com cho Nuvio',
    logo: 'https://phim.nguonc.com/public/images/Logo/logonguonc.png',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['nguonc:', 'tt'],
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
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'nguonc_phim_bo',
            name: '🔥 NguonC - Phim Bộ',
            extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'nguonc_tv_shows',
            name: '🔥 NguonC - TV Shows & Hoạt Hình',
            extra: [{ name: 'skip', isRequired: false }]
        }
    ]
};

app.get('/', (req, res) => {
    const host = req.headers['x-forwarded-proto']
        ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
        : `http://${req.headers.host}`;
    res.send(`
        <div style="font-family: sans-serif; max-width: 600px; margin: 30px auto; padding: 20px; border: 1px solid #ccc; border-radius: 10px;">
            <h2>🔥 NguonC Addon cho Nuvio đã sẵn sàng!</h2>
            <p>Sao chép đường dẫn Manifest bên dưới và dán vào mục <b>Add Addon</b> trong ứng dụng Nuvio:</p>
            <input type="text" value="${host}/manifest.json" style="width: 100%; padding: 10px; font-size: 16px; margin-bottom: 15px;" readonly onclick="this.select()" />
        </div>
    `);
});

app.get('/manifest.json', (req, res) => {
    res.json(manifest);
});

async function safeFetch(url) {
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

// ================= 2. XỬ LÝ CATALOG (DANH MỤC & TÌM KIẾM) =================
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

    const page = Math.floor(skip / 10) + 1;
    let apiUrl = '';

    if (search) {
        apiUrl = `${NGUONC_API}/films/search?keyword=${encodeURIComponent(search)}`;
    } else if (id === 'nguonc_phim_le') {
        apiUrl = `${NGUONC_API}/films/danh-sach/phim-le?page=${page}`;
    } else if (id === 'nguonc_phim_bo') {
        apiUrl = `${NGUONC_API}/films/danh-sach/phim-bo?page=${page}`;
    } else if (id === 'nguonc_tv_shows') {
        apiUrl = `${NGUONC_API}/films/danh-sach/tv-shows?page=${page}`;
    } else {
        apiUrl = `${NGUONC_API}/films/phim-moi-cap-nhat?page=${page}`;
    }

    const data = await safeFetch(apiUrl);
    const items = data?.items || [];

    const metas = items.map(item => {
        const isSeries = item.total_episodes > 1 || (item.current_episode && !item.current_episode.toLowerCase().includes('full'));
        return {
            id: `nguonc:${item.slug}`,
            type: type || (isSeries ? 'series' : 'movie'),
            name: item.name,
            poster: item.thumb_url || item.poster_url,
            background: item.poster_url || item.thumb_url,
            description: `[🔥 NguonC] Tên gốc: ${item.original_name || item.name}\nTrạng thái: ${item.current_episode || 'Full'} (${item.quality || 'HD'} - ${item.language || 'Vietsub'})\n${item.description || ''}`,
            releaseInfo: item.created ? item.created.substring(0, 4) : ''
        };
    });

    res.json({ metas });
});

// ================= 3. XỬ LÝ META (CHI TIẾT PHIM & CHỌN TẬP) =================
app.get('/meta/:type/:id.json', async (req, res) => {
    const { type } = req.params;
    const rawId = decodeURIComponent(req.params.id);

    if (!rawId.startsWith('nguonc:')) {
        return res.json({ meta: null });
    }

    const slug = rawId.replace('nguonc:', '');
    const data = await safeFetch(`${NGUONC_API}/film/${slug}`);
    const movie = data?.movie;

    if (!movie) return res.json({ meta: null });

    const meta = {
        id: `nguonc:${movie.slug}`,
        type: type,
        name: movie.name,
        poster: movie.thumb_url,
        background: movie.poster_url || movie.thumb_url,
        description: `${movie.description || ''}\n\nĐạo diễn: ${movie.director || 'Đang cập nhật'}\nDiễn viên: ${movie.casts || 'Đang cập nhật'}\nChất lượng: ${movie.quality || 'HD'} - ${movie.language || 'Vietsub'}`,
        releaseInfo: movie.current_episode || ''
    };

    if (type === 'series' && movie.episodes && movie.episodes.length > 0) {
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

    res.json({ meta });
});

// ================= 4. XỬ LÝ STREAM (LẤY LINK .M3U8) =================
async function getMetaFromImdb(type, imdbId) {
    const res = await safeFetch(`${CINEMETA_API}/${type}/${imdbId}.json`);
    return { name: res?.meta?.name };
}

app.get('/stream/:type/:id.json', async (req, res) => {
    const { type } = req.params;
    const rawId = decodeURIComponent(req.params.id);
    const parts = rawId.split(':');
    const prefix = parts[0];

    try {
        let slug = '';
        let targetEpNum = null;

        if (prefix === 'nguonc') {
            slug = parts[1];
            targetEpNum = parts[2] ? parseInt(parts[2]) : (type === 'series' ? 1 : null);
        } else if (prefix.startsWith('tt')) {
            const imdbId = parts[0];
            targetEpNum = parts[2] ? parseInt(parts[2]) : (type === 'series' ? 1 : null);
            const meta = await getMetaFromImdb(type, imdbId);
            if (!meta || !meta.name) return res.json({ streams: [] });

            const searchData = await safeFetch(`${NGUONC_API}/films/search?keyword=${encodeURIComponent(meta.name)}`);
            if (!searchData?.items?.length) return res.json({ streams: [] });

            const matched = searchData.items.find(i =>
                i.original_name?.toLowerCase() === meta.name.toLowerCase() ||
                i.name?.toLowerCase() === meta.name.toLowerCase()
            ) || searchData.items[0];

            slug = matched.slug;
        } else {
            return res.json({ streams: [] });
        }

        const detailData = await safeFetch(`${NGUONC_API}/film/${slug}`);
        const movie = detailData?.movie;
        if (!movie || !movie.episodes) return res.json({ streams: [] });

        const streams = [];
        for (const server of movie.episodes) {
            const items = server.items || [];
            let ep = items[0];

            if (targetEpNum !== null) {
                ep = items.find((item, idx) => {
                    const num = parseInt((item.name || '').replace(/\D/g, ''));
                    return num === targetEpNum || (idx + 1) === targetEpNum;
                }) || items[targetEpNum - 1];
            }

            if (ep && ep.m3u8) {
                streams.push({
                    name: `🔥 NguonC\n${server.server_name || 'VIP'}`,
                    title: `🔥 [NguonC] ${movie.name} - Tập ${ep.name}\n[${movie.quality || 'FHD'} - ${movie.language || 'Vietsub'}]`,
                    url: ep.m3u8,
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
    app.listen(PORT, () => console.log(`Server NguonC chạy tại: http://localhost:${PORT}`));
}

module.exports = app;

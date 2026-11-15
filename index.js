const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());

const NGUONC_API = 'https://phim.nguonc.com/api';
const CINEMETA_API = 'https://v3-cinemeta.strem.io/meta';

// 1. Khai báo Manifest đầy đủ: Catalog (Danh mục trang chủ + Tìm kiếm), Meta (Chi tiết phim), Stream (Link phát)
const manifest = {
    id: 'com.nuvio.nguonc.full',
    version: '1.2.0',
    name: 'NguonC Phim (Full Catalog & Stream)',
    description: 'Xem phim Vietsub, Thuyết minh, Lồng tiếng từ phim.nguonc.com trực tiếp trên Nuvio',
    logo: 'https://phim.nguonc.com/public/images/Logo/logonguonc.png',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    idPrefixes: ['nguonc:', 'tt'],
    catalogs: [
        {
            type: 'movie',
            id: 'nguonc_phim_moi',
            name: 'NguonC - Phim Mới Cập Nhật',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'skip', isRequired: false }
            ]
        },
        {
            type: 'movie',
            id: 'nguonc_phim_le',
            name: 'NguonC - Phim Lẻ',
            extra: [{ name: 'skip', isRequired: false }]
        },
        {
            type: 'series',
            id: 'nguonc_phim_bo',
            name: 'NguonC - Phim Bộ',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'skip', isRequired: false }
            ]
        },
        {
            type: 'series',
            id: 'nguonc_tv_shows',
            name: 'NguonC - TV Shows & Hoạt Hình',
            extra: [{ name: 'skip', isRequired: false }]
        }
    ]
};

// Trang chủ hướng dẫn nhanh khi mở bằng trình duyệt
app.get('/', (req, res) => {
    const host = req.headers['x-forwarded-proto']
        ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
        : `http://${req.headers.host}`;
    res.send(`
        <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
            <h2>🎬 Addon NguonC cho Nuvio đã hoạt động!</h2>
            <p>Sao chép đường dẫn Manifest bên dưới và dán vào mục <b>Add Addon</b> trong ứng dụng Nuvio:</p>
            <input type="text" value="${host}/manifest.json" style="width: 100%; padding: 10px; font-size: 16px; margin-bottom: 15px;" readonly onclick="this.select()" />
            <p><a href="/manifest.json" target="_blank">Xem file manifest.json</a></p>
        </div>
    `);
});

app.get('/manifest.json', (req, res) => {
    res.json(manifest);
});

// Chuyển đổi item của NguonC sang chuẩn Meta Preview của Nuvio
function toMetaPreview(item, defaultType = 'movie') {
    const isSeries = item.total_episodes > 1 || (item.current_episode && !item.current_episode.toLowerCase().includes('full'));
    return {
        id: `nguonc:${item.slug}`,
        type: defaultType || (isSeries ? 'series' : 'movie'),
        name: item.name,
        poster: item.thumb_url || item.poster_url,
        background: item.poster_url || item.thumb_url,
        description: `Tên gốc: ${item.original_name || item.name}\nTrạng thái: ${item.current_episode || 'Full'} (${item.quality || 'HD'} - ${item.language || 'Vietsub'})\n${item.description || ''}`,
        releaseInfo: item.created ? item.created.substring(0, 4) : ''
    };
}

// 2. Xử lý Catalog (Danh mục phim & Tìm kiếm)
async function handleCatalog(req, res) {
    const { type, id, extra } = req.params;
    let search = null;
    let skip = 0;

    if (extra) {
        const params = new URLSearchParams(extra);
        if (params.get('search')) search = params.get('search');
        if (params.get('skip')) skip = parseInt(params.get('skip')) || 0;
    }

    // NguonC phân trang 10 phim/trang
    const page = Math.floor(skip / 10) + 1;

    try {
        let apiUrl = '';
        if (search) {
            apiUrl = `${NGUONC_API}/films/search?keyword=${encodeURIComponent(search)}`;
        } else if (id === 'nguonc_phim_moi') {
            apiUrl = `${NGUONC_API}/films/phim-moi-cap-nhat?page=${page}`;
        } else if (id === 'nguonc_phim_le') {
            apiUrl = `${NGUONC_API}/films/danh-sach/phim-le?page=${page}`;
        } else if (id === 'nguonc_phim_bo') {
            apiUrl = `${NGUONC_API}/films/danh-sach/phim-bo?page=${page}`;
        } else if (id === 'nguonc_tv_shows') {
            apiUrl = `${NGUONC_API}/films/danh-sach/tv-shows?page=${page}`;
        } else {
            apiUrl = `${NGUONC_API}/films/phim-moi-cap-nhat?page=${page}`;
        }

        const response = await fetch(apiUrl);
        const data = await response.json();
        const items = data.items || [];

        const metas = items.map(item => toMetaPreview(item, type));
        res.json({ metas });
    } catch (err) {
        console.error('Lỗi Catalog:', err.message);
        res.json({ metas: [] });
    }
}

app.get('/catalog/:type/:id.json', handleCatalog);
app.get('/catalog/:type/:id/:extra.json', handleCatalog);

// 3. Xử lý Meta (Thông tin chi tiết phim & danh sách tập khi bấm vào phim từ danh mục NguonC)
app.get('/meta/:type/:id.json', async (req, res) => {
    const { type } = req.params;
    const rawId = decodeURIComponent(req.params.id);

    if (!rawId.startsWith('nguonc:')) {
        return res.json({ meta: null });
    }

    const slug = rawId.replace('nguonc:', '');

    try {
        const response = await fetch(`${NGUONC_API}/film/${slug}`);
        const data = await response.json();
        const movie = data.movie;

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

        // Nếu là phim bộ, tạo danh sách tập (videos) để người dùng chọn tập trong Nuvio
        if (type === 'series' && movie.episodes && movie.episodes.length > 0) {
            const epMap = new Map();
            movie.episodes.forEach(server => {
                (server.items || []).forEach((ep, idx) => {
                    const epSlug = ep.slug || `${idx + 1}`;
                    if (!epMap.has(epSlug)) {
                        epMap.set(epSlug, {
                            id: `nguonc:${movie.slug}:${epSlug}`,
                            title: `Tập ${ep.name}`,
                            season: 1,
                            episode: idx + 1
                        });
                    }
                });
            });
            meta.videos = Array.from(epMap.values());
        }

        res.json({ meta });
    } catch (err) {
        console.error('Lỗi Meta:', err.message);
        res.json({ meta: null });
    }
});

// Hàm phụ: Lấy tên phim từ IMDb ID (dùng khi bấm vào phim có sẵn trên Nuvio/TMDB)
async function getMetaFromImdb(type, imdbId) {
    try {
        const res = await fetch(`${CINEMETA_API}/${type}/${imdbId}.json`);
        if (!res.ok) return null;
        const data = await res.json();
        return {
            name: data.meta?.name
        };
    } catch (err) {
        return null;
    }
}

// 4. Xử lý Stream (Trả về link m3u8 cho cả ID NguonC lẫn IMDb ID)
app.get('/stream/:type/:id.json', async (req, res) => {
    const { type } = req.params;
    const rawId = decodeURIComponent(req.params.id);

    try {
        let slug = '';
        let targetEpSlug = null;
        let targetEpNumber = null;

        // Trường hợp 1: Mở phim từ danh mục NguonC (ID dạng nguonc:ten-phim hoặc nguonc:ten-phim:tap-1)
        if (rawId.startsWith('nguonc:')) {
            const parts = rawId.split(':');
            slug = parts[1];
            targetEpSlug = parts[2] || null;
        }
        // Trường hợp 2: Mở phim từ trang chủ TMDB/IMDb của Nuvio (ID dạng tt1234567 hoặc tt1234567:1:1)
        else if (rawId.startsWith('tt')) {
            const [imdbId, season, episode] = rawId.split(':');
            targetEpNumber = episode ? parseInt(episode) : null;

            const meta = await getMetaFromImdb(type, imdbId);
            if (!meta || !meta.name) return res.json({ streams: [] });

            const searchRes = await fetch(`${NGUONC_API}/films/search?keyword=${encodeURIComponent(meta.name)}`);
            const searchData = await searchRes.json();
            if (!searchData.items || searchData.items.length === 0) return res.json({ streams: [] });

            const matched = searchData.items.find(item =>
                item.original_name?.toLowerCase() === meta.name.toLowerCase() ||
                item.name?.toLowerCase() === meta.name.toLowerCase()
            ) || searchData.items[0];

            slug = matched.slug;
        } else {
            return res.json({ streams: [] });
        }

        // Gọi API chi tiết phim của NguonC để lấy link m3u8
        const detailRes = await fetch(`${NGUONC_API}/film/${slug}`);
        const detailData = await detailRes.json();
        const movie = detailData.movie;
        if (!movie || !movie.episodes) return res.json({ streams: [] });

        const streams = [];

        for (const server of movie.episodes) {
            const serverName = server.server_name || 'NguonC Server';
            const items = server.items || [];
            let matchedEp = null;

            if (targetEpSlug) {
                matchedEp = items.find(ep => ep.slug === targetEpSlug) || items[0];
            } else if (targetEpNumber !== null) {
                matchedEp = items.find((ep, idx) => {
                    const num = parseInt(ep.name.replace(/\D/g, ''));
                    return num === targetEpNumber || (idx + 1) === targetEpNumber;
                });
            } else {
                matchedEp = items[0];
            }

            if (matchedEp && matchedEp.m3u8) {
                streams.push({
                    name: `NguonC\n${serverName}`,
                    title: `${movie.name} - Tập ${matchedEp.name}\n[${movie.quality || 'HD'} - ${movie.language || 'Vietsub'}]`,
                    url: matchedEp.m3u8,
                    behaviorHints: {
                        notWebReady: false
                    }
                });
            }
        }

        res.json({ streams });
    } catch (err) {
        console.error('Lỗi Stream:', err.message);
        res.json({ streams: [] });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🎬 Addon NguonC đã chạy tại: http://localhost:${PORT}/manifest.json`);
        console.log(`====================================================`);
    });
}

module.exports = app;

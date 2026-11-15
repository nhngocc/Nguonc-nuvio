const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 7000;

app.use(cors());

const NGUONC_API = 'https://phim.nguonc.com/api';
const CINEMETA_API = 'https://v3-cinemeta.strem.io/meta';

// 1. Khai báo Manifest
const manifest = {
    id: 'com.nuvio.nguonc.stable',
    version: '3.6.0',
    name: '🔥 NguonC Phim (Ổn định)',
    description: 'Addon xem phim Vietsub/Thuyết minh từ phim.nguonc.com cho Nuvio',
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
        }
    ]
};

app.get('/', (req, res) => {
    const host = req.headers['x-forwarded-proto'] ? `${req.headers['x-forwarded-proto']}://${req.headers.host}` : `http://${req.headers.host}`;
    res.send(`
        <div style="font-family: sans-serif; max-width: 600px; margin: 30px auto; padding: 20px; border: 1px solid #ccc; border-radius: 10px;">
            <h2>🔥 NguonC Addon (Stable v3.6)</h2>
            <p>Link Manifest cài đặt cho Nuvio:</p>
            <input value="${host}/manifest.json" style="width:100%;padding:10px;font-size:16px;" readonly onclick="this.select()">
        </div>
    `);
});

app.get('/manifest.json', (req, res) => res.json(manifest));

// Hàm gọi API thông minh chống chặn Cloudflare
async function fetchNguonC(endpoint) {
    const targetUrl = `${NGUONC_API}${endpoint}`;
    const proxies = [
        targetUrl,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
    ];

    for (const url of proxies) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*'
                }
            });
            if (!res.ok) continue;
            const text = await res.text();
            if (!text || text.trim().startsWith('<')) continue; // Bỏ qua nếu bị trả về trang HTML chặn

            const parsed = JSON.parse(text);
            // Xử lý dữ liệu nếu đi qua proxy dạng allorigins/codetabs
            if (parsed && typeof parsed.contents === 'string') {
                return JSON.parse(parsed.contents);
            }
            if (parsed) return parsed;
        } catch (e) {
            continue;
        }
    }
    return null;
}

// ================= CATALOG =================
app.get('/catalog/:type/:id.json', async (req, res) => {
    const { type, id } = req.params;
    let search = req.query.search || null;
    let skip = parseInt(req.query.skip) || 0;

    if (req.params.extra) {
        const p = new URLSearchParams(req.params.extra);
        if (p.get('search')) search = p.get('search');
        if (p.get('skip')) skip = parseInt(p.get('skip')) || 0;
    }

    const page = Math.floor(skip / 10) + 1;
    let endpoint = `/films/phim-moi-cap-nhat?page=${page}`;

    if (search) {
        endpoint = `/films/search?keyword=${encodeURIComponent(search)}`;
    } else if (id === 'nguonc_phim_le') {
        endpoint = `/films/danh-sach/phim-le?page=${page}`;
    } else if (id === 'nguonc_phim_bo') {
        endpoint = `/films/danh-sach/phim-bo?page=${page}`;
    }

    const data = await fetchNguonC(endpoint);
    const items = data?.items || [];

    const metas = items.map(item => ({
        id: `nguonc:${item.slug}`,
        type: type,
        name: item.name,
        poster: item.thumb_url || item.poster_url,
        background: item.poster_url || item.thumb_url,
        description: `[🔥 NguonC] ${item.original_name || item.name} - ${item.current_episode || 'Full'} (${item.quality || 'HD'})`,
        releaseInfo: item.created ? item.created.substring(0, 4) : ''
    }));

    res.json({ metas });
});

// ================= META =================
app.get('/meta/:type/:id.json', async (req, res) => {
    const { type } = req.params;
    const rawId = decodeURIComponent(req.params.id);
    if (!rawId.startsWith('nguonc:')) return res.json({ meta: null });

    const slug = rawId.replace('nguonc:', '');
    const data = await fetchNguonC(`/film/${slug}`);
    const movie = data?.movie;
    if (!movie) return res.json({ meta: null });

    const meta = {
        id: `nguonc:${movie.slug}`,
        type: type,
        name: movie.name,
        poster: movie.thumb_url,
        background: movie.poster_url || movie.thumb_url,
        description: `${movie.description || ''}\n\nChất lượng: ${movie.quality || 'HD'} - ${movie.language || 'Vietsub'}`,
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

    res.json({ meta });
});

// ================= STREAM =================
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
            
            

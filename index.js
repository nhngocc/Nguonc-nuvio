const NGUONC_API = 'https://phim.nguonc.com/api';
const CINEMETA_API = 'https://v3-cinemeta.strem.io/meta';

const manifest = {
    id: 'com.nuvio.nguonc.native',
    version: '4.1.0',
    name: '🔥 NguonC Phim (Fast)',
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

// Hàm gọi 1 URL với timeout ngắn (3.5 giây)
async function fetchWithTimeout(url, timeoutMs = 3500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            }
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        if (!text || text.trim().startsWith('<')) throw new Error('Blocked HTML');
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.contents === 'string') return JSON.parse(parsed.contents);
        if (parsed) return parsed;
        throw new Error('Empty');
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

// Chạy đua song song cả 3 đường truyền cùng lúc (Trả kết quả trong ~1-2 giây)
async function fetchNguonC(endpoint) {
    const targetUrl = `${NGUONC_API}${endpoint}`;
    const raceUrls = [
        fetchWithTimeout(targetUrl, 3000),
        fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, 4000),
        fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`, 4000)
    ];

    try {
        return await Promise.any(raceUrls);
    } catch (e) {
        return null;
    }
}

function sendJson(res, data) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 200;
    res.end(JSON.stringify(data));
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.statusCode = 204;
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    if (pathname === '/' || pathname === '') {
        const host = req.headers['x-forwarded-proto']
            ? `${req.headers['x-forwarded-proto']}://${req.headers.host}`
            : `http://${req.headers.host}`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.statusCode = 200;
        return res.end(`
            <div style="font-family: sans-serif; max-width: 600px; margin: 30px auto; padding: 20px; border: 1px solid #ccc; border-radius: 10px;">
                <h2>🔥 NguonC Addon (v4.1 Fast Race)</h2>
                <p>Link Manifest cài đặt cho Nuvio:</p>
                <input value="${host}/manifest.json" style="width:100%;padding:10px;font-size:16px;" readonly onclick="this.select()">
            </div>
        `);
    }

    if (pathname === '/manifest.json') {
        return sendJson(res, manifest);
    }

    // ================= CATALOG =================
    if (pathname.startsWith('/catalog/')) {
        const cleanPath = pathname.replace('/catalog/', '').replace(/\.json$/, '');
        const parts = cleanPath.split('/');
        const type = parts[0];
        const id = parts[1];
        const extra = parts[2] || '';

        let search = parsedUrl.searchParams.get('search') || null;
        let skip = parseInt(parsedUrl.searchParams.get('skip')) || 0;

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

        return sendJson(res, { metas });
    }

    // ================= META =================
    if (pathname.startsWith('/meta/')) {
        const cleanPath = pathname.replace('/meta/', '').replace(/\.json$/, '');
        const [type, rawId] = cleanPath.split('/');
        if (!rawId || !rawId.startsWith('nguonc:')) return sendJson(res, { meta: null });

        const slug = rawId.replace('nguonc:', '');
        const data = await fetchNguonC(`/film/${slug}`);
        const movie = data?.movie;
        if (!movie) return sendJson(res, { meta: null });

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

        return sendJson(res, { meta });
    }

    // ================= STREAM =================
    if (pathname.startsWith('/stream/')) {
        const cleanPath = pathname.replace('/stream/', '').replace(/\.json$/, '');
        const [type, rawId] = cleanPath.split('/');
        if (!rawId) return sendJson(res, { streams: [] });

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

                const metaData = await fetchWithTimeout(`${CINEMETA_API}/${type}/${imdbId}.json`, 3000);
                const fullName = metaData?.meta?.name || '';
                if (!fullName) return sendJson(res, { streams: [] });

                // Cắt bỏ phần phụ sau dấu ':' hoặc '-' (VD: "Dragon Ball Super: Beerus" -> "Dragon Ball Super")
                const shortName = fullName.split(/[:\-–]/)[0].trim();
                const keywords = Array.from(new Set([fullName, shortName]));

                for (const kw of keywords) {
                    const searchData = await fetchNguonC(`/films/search?keyword=${encodeURIComponent(kw)}`);
                    if (searchData?.items?.length > 0) {
                        slug = searchData.items[0].slug;
                        break;
                    }
                }
            }

            if (!slug) return sendJson(res, { streams: [] });

            const detailData = await fetchNguonC(`/film/${slug}`);
            const movie = detailData?.movie;
            if (!movie || !movie.episodes) return sendJson(res, { streams: [] });

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

            return sendJson(res, { streams });
        } catch (err) {
            return sendJson(res, { streams: [] });
        }
    }

    res.statusCode = 404;
    res.end('Not Found');
};

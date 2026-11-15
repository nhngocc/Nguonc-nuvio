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
            <input value="${host}/manifest.json" style="width:100%;padding:10px;font-size:

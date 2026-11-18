const express = require('express');
require('dotenv').config();
const { put } = require('@vercel/blob');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const uploadDir = path.join(__dirname, 'uploads');
if (process.env.NODE_ENV !== 'production') {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
  app.use('/uploads', express.static(uploadDir));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format gambar harus JPG, PNG, WEBP, atau GIF'));
  },
});

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 4000,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

async function runQuery(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ============================================
// MIDDLEWARE PENGUNJUNG (Otomatis +1 saat refresh)
// ============================================
app.use(async (req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    try {
      const today = new Date().toISOString().split('T')[0];
      await pool.execute(
        `INSERT INTO pengunjung (tanggal, jumlah) VALUES (?, 1)
         ON DUPLICATE KEY UPDATE jumlah = jumlah + 1`,
        [today]
      );
    } catch (e) { console.error('Tracking gagal:', e.message); }
  }
  next();
});

// ============================================
// API PENGUNJUNG
// ============================================
app.get('/api/pengunjung', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [rowsHariIni] = await pool.execute('SELECT jumlah FROM pengunjung WHERE tanggal = ?', [today]);
    const hariIni = rowsHariIni.length > 0 ? rowsHariIni[0].jumlah : 0;
    
    res.json({
      jumlah: Number(hariIni),
      total: Number(hariIni)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// PROXY API HST (Cadangan)
// ============================================
app.get('/api-hst/statistik', async (req, res) => {
  try {
    const r = await fetch('https://data-mediacenter.hstkab.go.id/ref/getStatistik');
    const data = await r.json();
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// API BERITA
// ============================================
app.get('/api/berita', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 5000;
    const kategori = req.query.kategori || '';
    const q = req.query.q || '';
    const offset = (page - 1) * perPage;

    let sql = 'SELECT * FROM berita WHERE 1=1';
    const params = [];

    if (kategori && kategori !== 'Semua') { sql += ' AND kategori = ?'; params.push(kategori); }
    if (q) { sql += ' AND (judul LIKE ? OR ringkasan LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

    sql += ` ORDER BY tanggal DESC LIMIT ${perPage} OFFSET ${offset}`;
    const [rows] = await pool.execute(sql, params);

    const mapped = rows.map(r => ({
      id: r.id, id_berita: r.id, title: r.judul, judul: r.judul,
      kategori_id: r.kategori, kategori: r.kategori, tanggal: r.tanggal,
      ringkasan: r.ringkasan, isi: r.isi, foto: r.gambar, gambar: r.gambar,
      tag: r.tag, views: r.views || 0,
    }));
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/berita-populer', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const [rows] = await pool.execute(`SELECT * FROM berita WHERE views > 0 ORDER BY views DESC LIMIT ${limit}`);
    const mapped = rows.map(r => ({
      id: r.id, id_berita: r.id, title: r.judul, judul: r.judul,
      kategori_id: r.kategori, kategori: r.kategori, tanggal: r.tanggal,
      ringkasan: r.ringkasan, isi: r.isi, foto: r.gambar, gambar: r.gambar, views: r.views || 0,
    }));
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/berita/:id', async (req, res) => {
  try {
    const rows = await runQuery('SELECT * FROM berita WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json({ row: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const [[{ total_berita }]] = await pool.execute('SELECT COUNT(*) AS total_berita FROM berita');
    const [[{ total_klarifikasi }]] = await pool.execute('SELECT COUNT(*) AS total_klarifikasi FROM klarifikasi');
    const [[{ total_kategori }]] = await pool.execute('SELECT COUNT(*) AS total_kategori FROM kategori');
    res.json({
      total_berita: Number(total_berita),
      total_klarifikasi: Number(total_klarifikasi),
      total_kategori: Number(total_kategori),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/kategori', async (req, res) => {
  try {
    const rows = await runQuery('SELECT * FROM kategori ORDER BY id');
    res.json({ rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// API KLARIFIKASI
// ============================================
app.get('/api/klarifikasi', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 12;
    const offset = (page - 1) * perPage;
    const [rows] = await pool.execute(`SELECT * FROM klarifikasi ORDER BY tanggal DESC LIMIT ${perPage} OFFSET ${offset}`);
    const mapped = rows.map(r => ({
      id: r.id, id_hoaks: r.id_sumber || r.id, title: r.judul, judul: r.judul,
      slug: r.slug, tanggal: r.tanggal, ringkasan: r.ringkasan, isi: r.isi,
      foto: r.foto, link: r.link_sumber, views: r.views || 0,
    }));
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/klarifikasi/:id', async (req, res) => {
  try {
    const rows = await runQuery('SELECT * FROM klarifikasi WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json({ row: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// API RATING (GET & POST)
// ============================================
app.get('/api/rating/:id_berita', async (req, res) => {
  try {
    const rows = await runQuery(
      'SELECT COUNT(*) AS jumlah, COALESCE(SUM(nilai), 0) AS total FROM rating WHERE id_berita = ?',
      [req.params.id_berita]
    );
    const r = rows[0] || { jumlah: 0, total: 0 };
    res.json({
      jumlah: Number(r.jumlah),
      total: Number(r.total),
      rata: r.jumlah > 0 ? (Number(r.total) / Number(r.jumlah)).toFixed(1) : 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rating', async (req, res) => {
  try {
    const { id_berita, nilai } = req.body;
    if (!id_berita || !nilai || nilai < 1 || nilai > 5) {
      return res.status(400).json({ error: 'Data tidak valid' });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    await runQuery(
      'INSERT INTO rating (id_berita, nilai, ip) VALUES (?, ?, ?)',
      [id_berita, nilai, String(ip).slice(0, 45)]
    );

    const rows = await runQuery(
      'SELECT COUNT(*) AS jumlah, COALESCE(SUM(nilai), 0) AS total FROM rating WHERE id_berita = ?',
      [id_berita]
    );
    const r = rows[0] || { jumlah: 0, total: 0 };
    res.json({
      success: true,
      jumlah: Number(r.jumlah),
      total: Number(r.total),
      rata: r.jumlah > 0 ? (Number(r.total) / Number(r.jumlah)).toFixed(1) : 0,
    });
  } catch (err) {
    console.error('❌ POST /api/rating:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// API UPLOAD GAMBAR
// ============================================
app.post('/api/upload', upload.single('gambar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Tidak ada file' });
    const filename = `berita/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(req.file.originalname).toLowerCase()}`;
    const blob = await put(filename, req.file.buffer, { access: 'public', contentType: req.file.mimetype });
    res.json({ success: true, url: blob.url, filename: blob.pathname, size: req.file.size });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// START SERVER
// ============================================
if (process.env.NODE_ENV !== 'production') {
  const PORT = 5500;
  app.listen(PORT, () => console.log(`Server jalan di http://localhost:${PORT}`));
}

module.exports = app;
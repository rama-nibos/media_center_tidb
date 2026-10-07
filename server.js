// ============================================
// SERVER MEDIA CENTER HST — Express + TiDB + Proxy API HST
// ============================================

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
// ============================================
// FOLDER UPLOAD + STATIC
// ============================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Vercel Blob: pakai memoryStorage (bukan disk)
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
  ssl: { rejectUnauthorized: true },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

async function runQuery(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL) { cache.delete(key); return null; }
  return item.data;
}
function setCache(key, data) { cache.set(key, { data, time: Date.now() }); }

async function fetchHST(url, cacheKey = null) {
  if (cacheKey) {
    const cached = getCache(cacheKey);
    if (cached) return cached;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HST API error: ${r.status}`);
  const data = await r.json();
  if (cacheKey) setCache(cacheKey, data);
  return data;
}

// ============================================
// PROXY API HST
// ============================================
app.get('/api-hst/berita', async (req, res) => {
  try {
    const data = await fetchHST('https://mediacenter.hstkab.go.id/api/berita', 'hst-berita');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api-hst/berita-baru', async (req, res) => {
  try {
    const data = await fetchHST('https://mediacenter.hstkab.go.id/api/berita-baru', 'hst-berita-baru');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api-hst/berita-limit', async (req, res) => {
  try {
    const data = await fetchHST('https://mediacenter.hstkab.go.id/api/berita-limit', 'hst-berita-limit');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api-hst/hoax', async (req, res) => {
  try {
    const data = await fetchHST('https://mediacenter.hstkab.go.id/api/hoax', 'hst-hoax');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api-hst/hoax-limit', async (req, res) => {
  try {
    const data = await fetchHST('https://mediacenter.hstkab.go.id/api/hoax-limit', 'hst-hoax-limit');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api-hst/informasi', async (req, res) => {
  try {
    const data = await fetchHST('https://mediacenter.hstkab.go.id/api/informasi', 'hst-informasi');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api-hst/pengumuman', async (req, res) => {
  try {
    const data = await fetchHST('https://mediacenter.hstkab.go.id/api/pengumuman', 'hst-pengumuman');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api-hst/pengumuman-limit', async (req, res) => {
  try {
    const data = await fetchHST('https://mediacenter.hstkab.go.id/api/pengumuman-limit', 'hst-pengumuman-limit');
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api-hst/statistik', async (req, res) => {
  try {
    const r = await fetch('https://data-mediacenter.hstkab.go.id/ref/getStatistik');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const rows = await runQuery('SELECT jumlah FROM pengunjung WHERE tanggal = ?', [today]);
      res.json({
        total: rows[0]?.jumlah || 1357,
        today_visitors: rows[0]?.jumlah || 0,
        today_hits: String(rows[0]?.jumlah || 0),
        online: 1,
        _fallback: true,
      });
    } catch (err2) {
      res.status(500).json({ error: err2.message });
    }
  }
});

// ============================================
// API: BERITA (TiDB)
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

    if (kategori && kategori !== 'Semua') {
      sql += ' AND kategori = ?';
      params.push(kategori);
    }
    if (q) {
      sql += ' AND (judul LIKE ? OR ringkasan LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }

    // ⚠️ LIMIT & OFFSET harus angka langsung, bukan `?`
    sql += ` ORDER BY tanggal DESC LIMIT ${perPage} OFFSET ${offset}`;

    const [rows] = await pool.execute(sql, params);

    const mapped = rows.map(r => ({
      id: r.id,
      id_berita: r.id,
      title: r.judul,
      judul: r.judul,
      kategori_id: r.kategori,
      kategori: r.kategori,
      tanggal: r.tanggal,
      ringkasan: r.ringkasan,
      isi: r.isi,
      foto: r.gambar,
      gambar: r.gambar,
      tag: r.tag,
      views: r.views || 0,
    }));

    res.json(mapped);
  } catch (err) {
    console.error('❌ /api/berita:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Top berita populer (by views)
app.get('/api/berita-populer', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const [rows] = await pool.execute(
      `SELECT * FROM berita WHERE views > 0 ORDER BY views DESC LIMIT ${limit}`
    );

    const mapped = rows.map(r => ({
      id: r.id,
      id_berita: r.id,
      title: r.judul,
      judul: r.judul,
      kategori_id: r.kategori,
      kategori: r.kategori,
      tanggal: r.tanggal,
      ringkasan: r.ringkasan,
      isi: r.isi,
      foto: r.gambar,
      gambar: r.gambar,
      views: r.views || 0,
    }));

    res.json(mapped);
  } catch (err) {
    console.error('❌ /api/berita-populer:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/berita/:id', async (req, res) => {
  try {
    const rows = await runQuery('SELECT * FROM berita WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json({ row: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/berita', async (req, res) => {
  try {
    const { judul, kategori, tanggal, ringkasan, isi, tag, gambar } = req.body;
    const result = await runQuery(
      `INSERT INTO berita (judul, kategori, tanggal, ringkasan, isi, tag, gambar) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [judul, kategori, tanggal, ringkasan, isi, JSON.stringify(tag || []), gambar || null]
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('❌ POST /api/berita:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/berita/:id', async (req, res) => {
  try {
    const { judul, kategori, tanggal, ringkasan, isi, tag } = req.body;
    await runQuery(
      `UPDATE berita SET judul=?, kategori=?, tanggal=?, ringkasan=?, isi=?, tag=? WHERE id=?`,
      [judul, kategori, tanggal, ringkasan, isi, JSON.stringify(tag || []), req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ PUT /api/berita:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/berita/:id', async (req, res) => {
  try {
    await runQuery('DELETE FROM berita WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/berita/:id/view', async (req, res) => {
  try {
    await runQuery('UPDATE berita SET views = views + 1 WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// API: KATEGORI
// ============================================
app.get('/api/kategori', async (req, res) => {
  try {
    const rows = await runQuery('SELECT * FROM kategori ORDER BY id');
    res.json({ rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/kategori', async (req, res) => {
  try {
    const { nama, warna } = req.body;
    const result = await runQuery('INSERT INTO kategori (nama, warna) VALUES (?, ?)', [nama, warna]);
    res.json({ success: true, id: result.insertId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// API: RATING
// ============================================
app.get('/api/rating/:id_berita', async (req, res) => {
  try {
    const id = req.params.id_berita;
    const rows = await runQuery(
      'SELECT COUNT(*) AS jumlah, COALESCE(SUM(nilai), 0) AS total FROM rating WHERE id_berita = ?',
      [id]
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

    // Balikin rata-rata terbaru
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
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// API: KLARIFIKASI (TiDB)
// ============================================
app.get('/api/klarifikasi', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.per_page) || 12;
    const offset = (page - 1) * perPage;

    const [rows] = await pool.execute(
      `SELECT * FROM klarifikasi ORDER BY tanggal DESC LIMIT ${perPage} OFFSET ${offset}`
    );

    const mapped = rows.map(r => ({
      id: r.id,
      id_hoaks: r.id_sumber || r.id,
      title: r.judul,
      judul: r.judul,
      slug: r.slug,
      tanggal: r.tanggal,
      ringkasan: r.ringkasan,
      isi: r.isi,
      foto: r.foto,
      link: r.link_sumber,
      views: r.views || 0,
    }));

    res.json(mapped);
  } catch (err) {
    console.error('❌ /api/klarifikasi:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/klarifikasi/:id', async (req, res) => {
  try {
    const rows = await runQuery('SELECT * FROM klarifikasi WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Tidak ditemukan' });
    res.json({ row: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/klarifikasi', async (req, res) => {
  try {
    const { judul, tanggal, ringkasan, isi, foto, link } = req.body;
    const result = await runQuery(
      `INSERT INTO klarifikasi (judul, tanggal, ringkasan, isi, foto, link_sumber)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [judul, tanggal, ringkasan || '', isi || '', foto || '', link || '']
    );
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/klarifikasi/:id', async (req, res) => {
  try {
    const { judul, tanggal, ringkasan, isi, foto, link } = req.body;
    await runQuery(
      `UPDATE klarifikasi SET judul=?, tanggal=?, ringkasan=?, isi=?, foto=?, link_sumber=? WHERE id=?`,
      [judul, tanggal, ringkasan, isi, foto, link, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/klarifikasi/:id', async (req, res) => {
  try {
    await runQuery('DELETE FROM klarifikasi WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// API: PENGUNJUNG
// ============================================
app.post('/api/pengunjung', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    await runQuery(
      `INSERT INTO pengunjung (tanggal, jumlah) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE jumlah = jumlah + 1`,
      [today]
    );
    const rows = await runQuery('SELECT jumlah FROM pengunjung WHERE tanggal = ?', [today]);
    res.json({ jumlah: rows[0]?.jumlah || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/pengunjung', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const rows = await runQuery('SELECT jumlah FROM pengunjung WHERE tanggal = ?', [today]);
    res.json({ jumlah: rows[0]?.jumlah || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================
// API: UPLOAD GAMBAR
// ============================================
app.post('/api/upload', upload.single('gambar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Tidak ada file' });

    // Upload ke Vercel Blob
    const filename = `berita/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(req.file.originalname).toLowerCase()}`;

    const blob = await put(filename, req.file.buffer, {
      access: 'public',
      contentType: req.file.mimetype,
    });

    res.json({
      success: true,
      url: blob.url,             // ← URL lengkap dari Vercel Blob (https://...)
      filename: blob.pathname,
      size: req.file.size,
    });
  } catch (err) {
    console.error('❌ /api/upload:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// START SERVER
// ============================================
if (process.env.NODE_ENV !== 'production') {
  const PORT = 5500;
  app.listen(PORT, () => {
    console.log(`✅ Server jalan di http://localhost:${PORT}`);
    console.log(`📊 Database: media_center @ TiDB Cloud`);
    console.log(`🌐 Proxy API HST aktif di /api-hst/*`);
  });
}

module.exports = app;
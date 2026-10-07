// ============================================
// MIGRASI BERITA — dari API HST ke TiDB
// Jalankan sekali: node migrasi.js
// ============================================

const mysql = require('mysql2/promise');

const dbConfig = {
  host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: '2ipmnJSB5EPkH5C.root',
  password: 'F4GEtuvmLHghJ7WC',
  database: 'media_center',
  ssl: { rejectUnauthorized: true },
};

function stripHTML(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function potong(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) : str;
}

async function migrasi() {
  let conn;
  try {
    console.log('🔌 Menghubungkan ke TiDB...');
    conn = await mysql.createConnection(dbConfig);
    console.log('✅ Terhubung ke TiDB\n');

    console.log('📥 Mengambil berita dari API HST...');
    const res = await fetch('https://mediacenter.hstkab.go.id/api/berita');
    if (!res.ok) throw new Error(`HST API error: ${res.status}`);

    const semua = await res.json();
    console.log(`✅ Dapat ${semua.length} berita dari HST\n`);

    console.log('💾 Mulai insert ke TiDB...\n');

    let berhasil = 0;
    let gagal = 0;

    for (let i = 0; i < semua.length; i++) {
      const b = semua[i];
      try {
        const ringkasan = stripHTML(b.isi).slice(0, 300);
        await conn.execute(
          `INSERT INTO berita 
            (judul, kategori, tanggal, ringkasan, isi, gambar, tag, views)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            potong(b.title || 'Tanpa Judul', 490),
            potong(b.kategori_id || 'Umum', 100),
            b.tanggal,
            ringkasan,
            b.isi || '',
            potong(b.foto || '', 490),
            JSON.stringify([]),
            0,
          ]
        );
        berhasil++;

        if (berhasil % 50 === 0) {
          console.log(`   ✅ ${berhasil} berita di-insert (${i + 1}/${semua.length})...`);
        }
      } catch (err) {
        gagal++;
        if (gagal <= 5) console.error(`   ❌ #${i + 1}: ${err.message}`);
      }
    }

    console.log('\n============================================');
    console.log(`   ✅ Berhasil: ${berhasil}`);
    console.log(`   ❌ Gagal: ${gagal}`);
    console.log('============================================\n');

    console.log('🏷️  Membuat daftar kategori...');
    const kategoriUnik = [...new Set(semua.map(b => b.kategori_id).filter(Boolean))];
    const warna = ['#06b6d4', '#d946ef', '#facc15', '#ec4899', '#a855f7', '#10b981', '#f59e0b', '#ef4444'];

    for (let i = 0; i < kategoriUnik.length; i++) {
      try {
        await conn.execute(
          'INSERT IGNORE INTO kategori (nama, warna) VALUES (?, ?)',
          [kategoriUnik[i], warna[i % warna.length]]
        );
      } catch (err) {
        console.warn(`   ⚠️ ${err.message}`);
      }
    }

    const [[{ total }]] = await conn.execute('SELECT COUNT(*) AS total FROM berita');
    const [[{ totalKat }]] = await conn.execute('SELECT COUNT(*) AS totalKat FROM kategori');
    console.log(`\n🎯 Total berita di TiDB: ${total}`);
    console.log(`🎯 Total kategori: ${totalKat}`);
    console.log('\n✅ Migrasi selesai!\n');

  } catch (err) {
    console.error('❌ MIGRASI GAGAL:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

migrasi();
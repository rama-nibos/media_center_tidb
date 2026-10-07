// ============================================
// MIGRASI HOAX — dari API HST ke TiDB
// Jalankan: node migrasi-hoax.js
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
    console.log('✅ Terhubung\n');

    console.log('📥 Mengambil hoax dari API HST...');
    const res = await fetch('https://mediacenter.hstkab.go.id/api/hoax');
    if (!res.ok) throw new Error(`HST error: ${res.status}`);

    const semua = await res.json();
    console.log(`✅ Dapat ${semua.length} hoax dari HST\n`);

    console.log('💾 Insert ke TiDB...\n');
    let berhasil = 0, gagal = 0;

    for (let i = 0; i < semua.length; i++) {
      const b = semua[i];
      try {
        const ringkasan = stripHTML(b.isi).slice(0, 300);
        await conn.execute(
          `INSERT INTO klarifikasi 
            (id_sumber, judul, slug, tanggal, ringkasan, isi, foto, link_sumber, views)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            String(b.id_hoaks || '') || null,
            potong(b.title || 'Tanpa Judul', 490),
            potong(b.slug || '', 490),
            b.tanggal,
            ringkasan,
            b.isi || '',
            potong(b.foto || '', 490),
            potong(b.link || '', 490),
            0,
          ]
        );
        berhasil++;
        if (berhasil % 20 === 0) console.log(`   ✅ ${berhasil}/${semua.length}...`);
      } catch (err) {
        gagal++;
        if (gagal <= 3) console.error(`   ❌ #${i + 1}: ${err.message}`);
      }
    }

    console.log('\n============================================');
    console.log(`   ✅ Berhasil: ${berhasil}`);
    console.log(`   ❌ Gagal: ${gagal}`);
    console.log('============================================\n');

    const [[{ total }]] = await conn.execute('SELECT COUNT(*) AS total FROM klarifikasi');
    console.log(`🎯 Total klarifikasi di TiDB: ${total}`);
    console.log('\n✅ Migrasi hoax selesai!\n');

  } catch (err) {
    console.error('❌ MIGRASI GAGAL:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

migrasi();
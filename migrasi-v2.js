// ============================================
// MIGRASI v2 — Anti-Duplikat
// Jalankan: node migrasi-v2.js
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

// Normalisasi judul — buang spasi ekstra, lowercase
function normalisasiJudul(judul) {
  return String(judul || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

async function migrasi() {
  let conn;
  try {
    console.log('🔌 Menghubungkan ke TiDB...');
    conn = await mysql.createConnection(dbConfig);
    console.log('✅ Terhubung\n');

    // 1. Tarik semua berita dari HST
    console.log('📥 Mengambil berita dari API HST...');
    const res = await fetch('https://mediacenter.hstkab.go.id/api/berita');
    if (!res.ok) throw new Error(`HST error: ${res.status}`);

    const semua = await res.json();
    console.log(`✅ Dapat ${semua.length} berita dari HST\n`);

    // 2. Ambil judul + tanggal dari DB (untuk cek duplikat)
    console.log('🔍 Cek berita yang sudah ada di TiDB...');
    const [existing] = await conn.execute('SELECT judul, tanggal FROM berita');
    const setExisting = new Set();
    existing.forEach(r => {
      // Kunci unik: judul_normalized + tanggal (hari)
      const tgl = r.tanggal instanceof Date
        ? r.tanggal.toISOString().split('T')[0]
        : String(r.tanggal).split(' ')[0].split('T')[0];
      setExisting.add(`${normalisasiJudul(r.judul)}|${tgl}`);
    });
    console.log(`   ${existing.length} berita sudah ada di TiDB\n`);

    // 3. Insert yang baru saja
    let berhasil = 0;
    let skip = 0;
    let gagal = 0;

    console.log('💾 Mulai insert ke TiDB...\n');

    for (let i = 0; i < semua.length; i++) {
      const b = semua[i];

      // Kunci unik: judul + tanggal (hari)
      const judulNorm = normalisasiJudul(b.title);
      const tglHari = String(b.tanggal || '').split(' ')[0].split('T')[0];
      const kunci = `${judulNorm}|${tglHari}`;

      // Skip kalau sudah ada
      if (setExisting.has(kunci)) {
        skip++;
        continue;
      }

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
        setExisting.add(kunci); // tambahkan ke set biar nggak dobel kalau HST punya duplikat

        if (berhasil % 20 === 0) {
          console.log(`   ✅ ${berhasil} berita baru di-insert (${i + 1}/${semua.length})...`);
        }
      } catch (err) {
        gagal++;
        if (gagal <= 5) console.error(`   ❌ #${i + 1}: ${err.message}`);
      }
    }

    console.log('\n============================================');
    console.log('📊 RINGKASAN MIGRASI v2:');
    console.log(`   ✅ Berhasil (baru): ${berhasil}`);
    console.log(`   ⏭️  Skip (sudah ada): ${skip}`);
    console.log(`   ❌ Gagal: ${gagal}`);
    console.log('============================================\n');

    // 4. Verifikasi
    const [[{ total }]] = await conn.execute('SELECT COUNT(*) AS total FROM berita');
    console.log(`🎯 Total berita di TiDB sekarang: ${total}`);
    console.log('\n✅ Migrasi v2 selesai!\n');

  } catch (err) {
    console.error('❌ MIGRASI GAGAL:', err.message);
  } finally {
    if (conn) await conn.end();
  }
}

migrasi();
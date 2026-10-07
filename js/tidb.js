// ============================================
// MEDIA CENTER HST — API CLIENT + GLOBAL UI
// Sumber data: mediacenter.hstkab.go.id (via proxy)
// ============================================

const API_BASE = '/api-hst';

// ============================================
// 1. HELPER: GAMBAR
// ============================================
const FOLDER_GAMBAR = {
  berita:    'foto_brt',
  hoaks:     'foto_kotaku',
  informasi: 'foto_covid',
};

const BASE_GAMBAR = 'https://data-mediacenter.hstkab.go.id/assets';

function urlGambar(jenis, namaFile) {
  if (!namaFile) return null;
  const folder = FOLDER_GAMBAR[jenis];
  if (!folder) return null;
  return `${BASE_GAMBAR}/${folder}/${namaFile}`;
}

// ============================================
// 2. HELPER: TANGGAL (WITA = UTC+8)
// ============================================
function parseTanggal(str) {
  if (!str) return new Date();
  return new Date(str.replace(' ', 'T') + '+08:00');
}

// ============================================
// HELPER: TANGGAL — tahan banting semua format
// ============================================
function parseTanggal(str) {
  if (!str) return new Date();
  if (str instanceof Date) return str;
  if (typeof str === 'string') {
    // Handle "YYYY-MM-DD HH:mm:ss" atau ISO
    return new Date(str.replace(' ', 'T'));
  }
  return new Date(str);
}

function formatTanggal(str) {
  if (!str) return '-';
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni',
                 'Juli','Agustus','September','Oktober','November','Desember'];
  const d = parseTanggal(str);
  if (isNaN(d.getTime())) return '-';
  return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTanggalJam(str) {
  if (!str) return '-';
  const d = parseTanggal(str);
  if (isNaN(d.getTime())) return '-';
  const jam = String(d.getHours()).padStart(2, '0');
  const menit = String(d.getMinutes()).padStart(2, '0');
  return `${formatTanggal(str)} — ${jam}:${menit} WITA`;
}

// ============================================
// 3. HELPER: SANITASI HTML
// ============================================
function sanitasiHTML(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script, iframe, style, object, embed, form, input, button').forEach(el => el.remove());
  div.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
      if (attr.name === 'href' && /^javascript:/i.test(attr.value)) el.removeAttribute('href');
    });
  });
  return div.innerHTML;
}

// ============================================
// 4. FETCH WRAPPER
// ============================================
async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// ============================================
// 5. API PUBLIK — BERITA
// ============================================
async function apiGetBerita()       { return apiFetch('/berita'); }
async function apiGetBeritaBaru()   { return apiFetch('/berita-baru'); }
async function apiGetBeritaLimit()  { return apiFetch('/berita-limit'); }

async function apiGetBeritaById(id) {
  const semua = await apiGetBerita();
  return semua.find(b => String(b.id_berita) === String(id)) || null;
}

async function apiGetBeritaBySlug(slug) {
  const semua = await apiGetBerita();
  return semua.find(b => b.slug === slug) || null;
}

// ============================================
// 6. API PUBLIK — HOAKS / KLARIFIKASI
// ============================================
async function apiGetHoaks()      { return apiFetch('/hoax'); }
async function apiGetHoaksLimit() { return apiFetch('/hoax-limit'); }

// ============================================
// 7. API PUBLIK — INFORMASI
// ============================================
async function apiGetInformasi()  { return apiFetch('/informasi'); }

// ============================================
// 8. API PUBLIK — PENGUMUMAN
// ============================================
async function apiGetPengumuman()      { return apiFetch('/pengumuman'); }
async function apiGetPengumumanLimit() { return apiFetch('/pengumuman-limit'); }

// ============================================
// 9. API PUBLIK — STATISTIK
// ============================================
async function apiGetStatistik() {
  return apiFetch('/statistik');
}

async function apiIncrementPengunjung() {
  try {
    const res = await fetch('/api/pengunjung', { method: 'POST' });
    const json = await res.json();
    return json.jumlah || 0;
  } catch (err) {
    try {
      const stat = await apiGetStatistik();
      return stat.total || 0;
    } catch (e) {
      return 0;
    }
  }
}

// ============================================
// 10. DETEKSI KLIK MENU
// Kalau user klik link internal, set flag di sessionStorage
// ============================================
(function deteksiKlikMenu() {
  document.addEventListener('click', function (e) {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Skip link eksternal / anchor / mailto / tel / new tab
    if (href.startsWith('http')) return;
    if (href.startsWith('#')) return;
    if (href.startsWith('mailto:')) return;
    if (href.startsWith('tel:')) return;
    if (href.startsWith('whatsapp:')) return;
    if (link.target === '_blank') return;

    // Tandai: ini klik dari menu, bukan refresh
    sessionStorage.setItem('dariKlikMenu', 'true');
  });
})();

// ============================================
// 11. LOADING PAGE
// Muncul saat refresh · Tidak muncul saat klik menu
// ============================================
(function initLoadingPage() {
  document.addEventListener('DOMContentLoaded', function () {
    const loadingEl = document.getElementById('loadingPage');
    if (!loadingEl) return;

    const dariKlikMenu = sessionStorage.getItem('dariKlikMenu') === 'true';

    if (dariKlikMenu) {
      sessionStorage.removeItem('dariKlikMenu');
      loadingEl.classList.add('hidden');
      document.body.style.overflow = '';
    } else {
      // Kunci scroll biar layout stabil saat loading
      document.body.style.overflow = 'hidden';

      const sembunyikan = () => {
        loadingEl.classList.add('hidden');
        document.body.style.overflow = '';
      };
      window.addEventListener('load', () => setTimeout(sembunyikan, 800));
      setTimeout(sembunyikan, 5000);
    }
  });
})();

// ============================================
// 12. DARK MODE GLOBAL
// ============================================
(function initDarkModeGlobal() {
  function applyTheme() {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'false') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
      if (saved === null) localStorage.setItem('darkMode', 'true');
    }
  }

  function updateIcon() {
    const btn = document.getElementById('toggleDark');
    if (!btn) return;
    const isLight = document.body.classList.contains('light-mode');
    btn.textContent = isLight ? '🌙' : '☀️';
    btn.title = isLight ? 'Mode Gelap' : 'Mode Terang';
  }

  applyTheme();

  document.addEventListener('DOMContentLoaded', function () {
    applyTheme();
    updateIcon();

    const btn = document.getElementById('toggleDark');
    if (btn) {
      btn.addEventListener('click', function () {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('darkMode', isLight ? 'false' : 'true');
        updateIcon();
      });
    }
  });
})();

// ============================================
// 13. JAM REALTIME GLOBAL
// ============================================
(function initJamGlobal() {
  function updateJam() {
    const el = document.getElementById('jamRealtime');
    if (!el) return;
    const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                   'Agustus','September','Oktober','November','Desember'];
    const now = new Date();
    const tglStr = `📅 ${hari[now.getDay()]}, ${now.getDate()} ${bulan[now.getMonth()]} ${now.getFullYear()}`;
    const jamStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    el.innerHTML = `${tglStr} <br> ${jamStr}`;
  }

  document.addEventListener('DOMContentLoaded', function () {
    updateJam();
    setInterval(updateJam, 1000);
  });
})();

// ============================================
// 14. PROGRESS BAR GLOBAL
// ============================================
(function initProgressBarGlobal() {
  document.addEventListener('DOMContentLoaded', function () {
    const bar = document.getElementById('progressBar');
    if (!bar) return;
    window.addEventListener('scroll', function () {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const percent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      bar.style.width = percent + '%';
    });
  });
})();

// ============================================
// 15. CUACA WIDGET GLOBAL (Open-Meteo)
// ============================================
(function initCuacaGlobal() {
  const LAT = -2.5842;
  const LON = 115.3833;

  function kodeCuaca(code) {
    const map = {
      0:  { icon: '☀️', desc: 'Cerah' },
      1:  { icon: '🌤️', desc: 'Cerah Berawan' },
      2:  { icon: '⛅', desc: 'Berawan Sebagian' },
      3:  { icon: '☁️', desc: 'Berawan' },
      45: { icon: '🌫️', desc: 'Berkabut' },
      48: { icon: '🌫️', desc: 'Kabut Tebal' },
      51: { icon: '🌦️', desc: 'Gerimis Ringan' },
      53: { icon: '🌦️', desc: 'Gerimis' },
      55: { icon: '🌧️', desc: 'Gerimis Lebat' },
      61: { icon: '🌧️', desc: 'Hujan Ringan' },
      63: { icon: '🌧️', desc: 'Hujan Sedang' },
      65: { icon: '🌧️', desc: 'Hujan Lebat' },
      80: { icon: '🌦️', desc: 'Hujan Lokal' },
      81: { icon: '🌧️', desc: 'Hujan Lebat' },
      82: { icon: '⛈️', desc: 'Hujan Sangat Lebat' },
      95: { icon: '⛈️', desc: 'Badai Petir' },
      96: { icon: '⛈️', desc: 'Badai Petir + Es' },
      99: { icon: '⛈️', desc: 'Badai Petir Hebat' },
    };
    return map[code] || { icon: '🌡️', desc: 'Tidak diketahui' };
  }

  async function loadCuaca() {
    const el = document.getElementById('cuacaWidget');
    if (!el) return;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
        `&timezone=Asia%2FMakassar&forecast_days=4`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const current = data.current;
      const daily = data.daily;
      const cuacaSekarang = kodeCuaca(current.weather_code);

      const hariNama = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
      const forecastHTML = daily.time.slice(0, 4).map((tgl, i) => {
        const d = new Date(tgl);
        const c = kodeCuaca(daily.weather_code[i]);
        const namaHari = i === 0 ? 'Hari ini' : hariNama[d.getDay()];
        return `
          <div class="cuaca-day">
            <div class="cuaca-day-name">${namaHari}</div>
            <div class="cuaca-day-icon">${c.icon}</div>
            <div class="cuaca-day-temp">${Math.round(daily.temperature_2m_min[i])}° / ${Math.round(daily.temperature_2m_max[i])}°</div>
          </div>
        `;
      }).join('');

      el.innerHTML = `
        <div class="cuaca-main">
          <div class="cuaca-icon">${cuacaSekarang.icon}</div>
          <div>
            <div class="cuaca-temp">${Math.round(current.temperature_2m)}°C</div>
            <div class="cuaca-desc">${cuacaSekarang.desc}</div>
          </div>
        </div>
        <div class="cuaca-details">
          <div class="cuaca-detail-item"><span>💧</span><span>${current.relative_humidity_2m}%</span></div>
          <div class="cuaca-detail-item"><span>💨</span><span>${current.wind_speed_10m} km/j</span></div>
        </div>
        <div class="cuaca-forecast">${forecastHTML}</div>
      `;
    } catch (err) {
      console.warn('⚠️ Cuaca gagal:', err.message);
      el.innerHTML = '<p style="color:#94a3b8;font-size:0.85rem;">⚠️ Gagal memuat cuaca.</p>';
    }
  }

  document.addEventListener('DOMContentLoaded', loadCuaca);
})();

// ============================================
// 17. HERO SLIDER — AUTO ROTATE
// Otomatis jalan kalau ada .hero-slide & .hero-dot
// ============================================
(function initHeroSlider() {
  document.addEventListener('DOMContentLoaded', function () {
    const slides = document.querySelectorAll('.hero-slide');
    const dots   = document.querySelectorAll('.hero-dot');
    if (slides.length === 0) return;

    let current = 0;
    const INTERVAL = 4000; // ganti gambar tiap 4 detik

    function tampilkanSlide(index) {
      slides.forEach((s, i) => s.classList.toggle('active', i === index));
      dots.forEach((d, i) => d.classList.toggle('active', i === index));
      current = index;
    }

    function slideBerikutnya() {
      const next = (current + 1) % slides.length;
      tampilkanSlide(next);
    }

    // Auto-rotate
    let timer = setInterval(slideBerikutnya, INTERVAL);

    // Klik dot → pindah slide + reset timer
    dots.forEach((dot, i) => {
      dot.addEventListener('click', function () {
        tampilkanSlide(i);
        clearInterval(timer);
        timer = setInterval(slideBerikutnya, INTERVAL);
      });
    });

    // Pause saat tab browser nggak aktif
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearInterval(timer);
      } else {
        clearInterval(timer);
        timer = setInterval(slideBerikutnya, INTERVAL);
      }
    });
  });
})();

// ============================================
// CRUD BERITA (TiDB)
// ============================================
async function apiGetBeritaDB(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetch(`/api/berita${q ? '?' + q : ''}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiTambahBerita(data) {
  const res = await fetch('/api/berita', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Gagal tambah: ${res.status}`);
  return res.json();
}

async function apiUpdateBerita(id, data) {
  const res = await fetch(`/api/berita/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Gagal update: ${res.status}`);
  return res.json();
}

async function apiHapusBerita(id) {
  const res = await fetch(`/api/berita/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Gagal hapus: ${res.status}`);
  return res.json();
}

window.apiGetBeritaDB  = apiGetBeritaDB;
window.apiTambahBerita = apiTambahBerita;
window.apiUpdateBerita = apiUpdateBerita;
window.apiHapusBerita  = apiHapusBerita;

// ============================================
// BERITA DARI TiDB — dengan pagination
// ============================================
async function apiGetBeritaPaged({ page = 1, per_page = 12, kategori = '', q = '' } = {}) {
  const params = new URLSearchParams();
  params.set('page', page);
  params.set('per_page', per_page);
  if (kategori && kategori !== 'Semua') params.set('kategori', kategori);
  if (q) params.set('q', q);

  const res = await fetch(`/api/berita?${params.toString()}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiCariBeritaById(id) {
  const res = await fetch(`/api/berita/${id}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`API error: ${res.status}`);
  }
  const json = await res.json();
  return json.row || null;
}

window.apiGetBeritaPaged = apiGetBeritaPaged;
window.apiCariBeritaById = apiCariBeritaById;

// ============================================
// API: KLARIFIKASI (TiDB)
// ============================================
async function apiGetKlarifikasiPaged({ page = 1, per_page = 12 } = {}) {
  const params = new URLSearchParams();
  params.set('page', page);
  params.set('per_page', per_page);
  const res = await fetch(`/api/klarifikasi?${params.toString()}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function apiCariKlarifikasiById(id) {
  const res = await fetch(`/api/klarifikasi/${id}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`API error: ${res.status}`);
  }
  const json = await res.json();
  return json.row || null;
}

async function apiTambahKlarifikasi(data) {
  const res = await fetch('/api/klarifikasi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Gagal tambah: ${res.status}`);
  return res.json();
}

async function apiUpdateKlarifikasi(id, data) {
  const res = await fetch(`/api/klarifikasi/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Gagal update: ${res.status}`);
  return res.json();
}

async function apiHapusKlarifikasi(id) {
  const res = await fetch(`/api/klarifikasi/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Gagal hapus: ${res.status}`);
  return res.json();
}

window.apiGetKlarifikasiPaged   = apiGetKlarifikasiPaged;
window.apiCariKlarifikasiById   = apiCariKlarifikasiById;
window.apiTambahKlarifikasi     = apiTambahKlarifikasi;
window.apiUpdateKlarifikasi     = apiUpdateKlarifikasi;
window.apiHapusKlarifikasi      = apiHapusKlarifikasi;

// ============================================
// 16. EXPORT KE WINDOW
// ============================================
window.apiGetBerita         = apiGetBerita;
window.apiGetBeritaBaru     = apiGetBeritaBaru;
window.apiGetBeritaLimit    = apiGetBeritaLimit;
window.apiGetBeritaById     = apiGetBeritaById;
window.apiGetBeritaBySlug   = apiGetBeritaBySlug;
window.apiGetHoaks          = apiGetHoaks;
window.apiGetHoaksLimit     = apiGetHoaksLimit;
window.apiGetInformasi      = apiGetInformasi;
window.apiGetPengumuman     = apiGetPengumuman;
window.apiGetPengumumanLimit = apiGetPengumumanLimit;
window.apiGetStatistik      = apiGetStatistik;
window.apiIncrementPengunjung = apiIncrementPengunjung;
window.urlGambar            = urlGambar;
window.formatTanggal        = formatTanggal;
window.formatTanggalJam     = formatTanggalJam;
window.sanitasiHTML         = sanitasiHTML;
window.parseTanggal         = parseTanggal;
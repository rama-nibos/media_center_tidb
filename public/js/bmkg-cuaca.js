// ============================================
// WIDGET CUACA BARABAI — BMKG API
// ============================================

// Kode ADM4 Barabai Darat
const ADM4_BARABAI = '63.07.06.1001';

async function ambilCuacaBMKG() {
  const widget = document.getElementById('cuacaWidget');
  if (!widget) return;

  try {
    // BMKG API endpoint
    const url = `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${ADM4_BARABAI}`;
    const response = await fetch(url);
    const data = await response.json();

    console.log('✅ Data BMKG loaded:', data);

    // Cek struktur data
    if (!data.data || !data.data[0] || !data.data[0].cuaca) {
      throw new Error('Struktur data BMKG tidak sesuai');
    }

    // Ambil prakiraan pertama (waktu terdekat)
    const prakiraan = data.data[0].cuaca[0];

    // Mapping deskripsi cuaca BMKG ke emoji
    const cuacaMap = {
      'Cerah': '☀️',
      'Cerah Berawan': '🌤️',
      'Berawan': '☁️',
      'Berawan Tebal': '☁️',
      'Udara Kabur': '🌫️',
      'Asap': '🌫️',
      'Kabut': '🌫️',
      'Hujan Ringan': '🌦️',
      'Hujan Sedang': '🌧️',
      'Hujan Lebat': '🌧️',
      'Hujan Lokal': '🌦️',
      'Hujan Petir': '⛈️'
    };

    const desc = prakiraan.weather_desc || prakiraan.weather_desc_en || 'Cerah';
    const icon = cuacaMap[desc] || '🌡️';

    // Format waktu
    const waktu = new Date(prakiraan.local_datetime);
    const jamStr = `${String(waktu.getHours()).padStart(2, '0')}:${String(waktu.getMinutes()).padStart(2, '0')}`;

    // Render widget
    widget.innerHTML = `
      <div class="cuaca-main">
        <div class="cuaca-icon">${icon}</div>
        <div>
          <div class="cuaca-temp">${prakiraan.t}°C</div>
          <div class="cuaca-desc">${desc} · Lembap ${prakiraan.hu}%</div>
        </div>
      </div>
      <div class="cuaca-details">
        <div class="cuaca-detail-item"><span>💨</span> <span>${prakiraan.ws} km/j</span></div>
        <div class="cuaca-detail-item"><span>🕐</span> <span>Update ${jamStr} WITA</span></div>
      </div>
      <p style="font-size:0.7rem;color:#94a3b8;margin-top:12px;text-align:center;">
        Sumber: <a href="https://www.bmkg.go.id" target="_blank" style="color:#c9a227;text-decoration:none;">BMKG</a>
      </p>
    `;

  } catch (error) {
    console.error('❌ Gagal mengambil data cuaca BMKG:', error);
    widget.innerHTML = '<p style="color:#94a3b8;font-size:0.85rem;">Cuaca tidak tersedia saat ini.</p>';
  }
}

// Panggil saat halaman dimuat
document.addEventListener('DOMContentLoaded', ambilCuacaBMKG);

// Refresh setiap 30 menit
setInterval(ambilCuacaBMKG, 1800000);
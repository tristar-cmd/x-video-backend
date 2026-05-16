const express = require('express');
const cors = require('cors');
const YTDlpWrap = require('yt-dlp-wrap').default;
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const downloadDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadDir)){
    fs.mkdirSync(downloadDir);
}

app.use('/static_videos', express.static(downloadDir));

// 1. BULUT AYARI: İşletim sistemine göre Linux veya Windows motorunu seçer
const exePath = path.join(__dirname, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
let ytDlp;

async function initializeEngine() {
  try {
    if (!fs.existsSync(exePath)) {
      console.log(`⏳ Motor aranıyor... (${process.platform} formatı)`);
      await YTDlpWrap.downloadFromGithub(exePath);
      
      // Linux sunucularında dosyaya çalıştırma yetkisi (chmod) vermeliyiz
      if(process.platform !== 'win32') {
          fs.chmodSync(exePath, 0o775);
      }
      console.log("✅ yt-dlp Çekirdek Motoru Entegre Edildi!");
    } else {
      console.log("✅ yt-dlp Şifre Çözücü Motor Hazır!");
    }
    ytDlp = new YTDlpWrap(exePath);
  } catch (error) {
    console.error("❌ Motor başlatma hatası:", error.message);
  }
}

initializeEngine();

// Otomatik Temizlikçi Bot
setInterval(() => {
  fs.readdir(downloadDir, (err, files) => {
    if (err) return;
    const simdi = Date.now();
    const besDakika = 5 * 60 * 1000;
    files.forEach(file => {
      const filePath = path.join(downloadDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        if (simdi - stats.birthtimeMs > besDakika) {
          fs.unlink(filePath, () => console.log(`🧹 Süresi dolan dosya silindi: ${file}`));
        }
      });
    });
  });
}, 60 * 1000);

app.post('/api/extract', async (req, res) => {
  const { videoUrl } = req.body;
  if (!videoUrl) return res.status(400).json({ success: false, error: 'URL eksik' });

  if (!ytDlp) return res.status(500).json({ success: false, error: 'Motor henüz hazır değil.' });

  try {
    const filename = `video_${Date.now()}.mp4`;
    const outputPath = path.join(downloadDir, filename);

    await ytDlp.execPromise([videoUrl, '-f', 'best', '-o', outputPath]);

    // 2. BULUT AYARI: Railway'in bize vereceği canlı Domain'i dinamik olarak yakalar
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.get('host');

    res.json({
      success: true,
      title: "Premium_Video",
      quality: "1080p (HQ)",
      downloadUrl: `${protocol}://${host}/static_videos/${filename}`
    });

  } catch (error) {
    console.error("❌ Hata:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. BULUT AYARI: Port numarasını Railway'in atamasına izin verir
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 SaaS Sunucumuz ${PORT} portunda yayında!`);
});
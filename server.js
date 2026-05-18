const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR);
}

app.use('/downloads', express.static(DOWNLOADS_DIR));

const ytDlpPath = path.join(__dirname, 'yt-dlp');

// 🔄 OTO İNDİRME MOTORU: Eğer sunucuda yt-dlp yoksa otomatik indirir
function checkAndDownloadYtDlp() {
    if (fs.existsSync(ytDlpPath)) {
        console.log("✅ yt-dlp motoru zaten sunucuda mevcut, hazır!");
        return;
    }

    console.log("⏳ yt-dlp motoru bulunamadı! Resmi GitHub deposundan Linux sürümü indiriliyor...");
    
    function download(url) {
        https.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                download(res.headers.location);
                return;
            }

            if (res.statusCode !== 200) {
                console.error(`❌ İndirme başarısız. Durum Kodu: ${res.statusCode}`);
                return;
            }

            const file = fs.createWriteStream(ytDlpPath);
            res.pipe(file);

            file.on('finish', () => {
                file.close();
                fs.chmodSync(ytDlpPath, '755'); // Çalıştırma izni ver
                console.log('🎉 yt-dlp motoru başarıyla indirildi ve sisteme entegre edildi!');
            });
        }).on('error', (err) => {
            console.error('❌ İndirme sırasında hata:', err.message);
        });
    }

    download('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp');
}

// Sunucu başlarken motoru kontrol et
checkAndDownloadYtDlp();

// 🚀 Ana Video Çözme Rotası
app.post('/api/extract', async (req, res) => {
    const { videoUrl } = req.body;
    const authHeader = req.headers.authorization; 
    
    if (!authHeader) {
        return res.status(401).json({ error: "Lütfen önce eklentiden giriş yapın!" });
    }

    try {
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: "Oturum geçersiz, lütfen tekrar giriş yapın." });
        }

        const today = new Date().toISOString().split('T')[0];
        let { data: usage } = await supabase.from('user_usage').select('*').eq('id', user.id).single();

        if (!usage) {
            await supabase.from('user_usage').insert({ id: user.id, email: user.email, download_count: 1, last_download_date: today });
        } else {
            if (usage.last_download_date !== today) {
                await supabase.from('user_usage').update({ download_count: 1, last_download_date: today }).eq('id', user.id);
            } else {
                if (usage.download_count >= 3) {
                    return res.status(403).json({ error: "🔒 Günlük ücretsiz indirme limitinize (3/3) ulaştınız! Sınırsız indirme için Premium'a geçin." });
                }
                await supabase.from('user_usage').update({ download_count: usage.download_count + 1 }).eq('id', user.id);
            }
        }

        // Eğer motor henüz iniyorsa kullanıcıya bilgi verelim
        if (!fs.existsSync(ytDlpPath)) {
            return res.status(503).json({ error: "⏳ Sunucu motoru şu an optimize ediliyor, lütfen 10 saniye sonra tekrar deneyin." });
        }

        const outputFilename = `video_${Date.now()}.mp4`;
        const outputPath = path.join(DOWNLOADS_DIR, outputFilename);
        const command = `${ytDlpPath} "${videoUrl}" -f best -o "${outputPath}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error("❌ YT-DLP ÇALIŞMA HATASI:", error);
                console.error("❌ ERROR DETAYI (STDERR):", stderr);
                return res.status(500).json({ error: "Video çözülemedi." });
            }
            const downloadUrl = `${req.protocol}://${req.get('host')}/downloads/${outputFilename}`;
            res.json({ success: true, downloadUrl });
        });

    } catch (globalError) {
        res.status(500).json({ error: "Sistem hatası oluştu." });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`🚀 SaaS Backend ${PORT} portunda yayında!`);
});

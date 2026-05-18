const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Railway kasasından şifreleri çekip Supabase bağlantısını kuruyoruz
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR);
}

app.use('/downloads', express.static(DOWNLOADS_DIR));

// 2. Ana video çözme rotamız artık limit kontrollü!
app.post('/api/extract', async (req, res) => {
    const { videoUrl } = req.body;
    
    // Eklentiden gelen kullanıcının gizli kimlik token'ı
    const authHeader = req.headers.authorization; 
    
    if (!authHeader) {
        return res.status(401).json({ error: "Lütfen önce eklentiden giriş yapın!" });
    }

    try {
        // 3. Token'ı doğrulayıp kullanıcının kim olduğunu Supabase'e soruyoruz
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: "Oturum geçersiz, lütfen tekrar giriş yapın." });
        }

        // 4. Kullanıcının bugünkü indirme sayacını kontrol ediyoruz
        const today = new Date().toISOString().split('T')[0];
        let { data: usage, error: usageError } = await supabase
            .from('user_usage')
            .select('*')
            .eq('id', user.id)
            .single();

        if (!usage) {
            // İlk kez indirme yapan kullanıcıyı veri tabanına kaydediyoruz
            await supabase.from('user_usage').insert({ id: user.id, email: user.email, download_count: 1, last_download_date: today });
        } else {
            if (usage.last_download_date !== today) {
                // Yeni bir güne girilmiş, sayacı sıfırlayıp 1 yapıyoruz
                await supabase.from('user_usage').update({ download_count: 1, last_download_date: today }).eq('id', user.id);
            } else {
                // Bugün zaten indirme yapmış, limit kontrolü (Ücretsiz sınır: 3)
                if (usage.download_count >= 3) {
                    return res.status(403).json({ error: "🔒 Günlük ücretsiz indirme limitinize (3/3) ulaştınız! Sınırsız indirme için Premium'a geçin." });
                }
                // Limiti dolmadıysa sayacı 1 artırıyoruz
                await supabase.from('user_usage').update({ download_count: usage.download_count + 1 }).eq('id', user.id);
            }
        }

        // 5. Her şey yolundaysa yt-dlp motorunu ateşliyoruz (Eski çalışan güvenli kodun)
        const outputFilename = `video_${Date.now()}.mp4`;
        const outputPath = path.join(DOWNLOADS_DIR, outputFilename);
        const ytDlpPath = path.join(__dirname, 'yt-dlp');

        const command = `${ytDlpPath} ${videoUrl} -f best -o ${outputPath}`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
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

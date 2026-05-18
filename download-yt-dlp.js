const https = require('https');
const fs = require('fs');
const path = require('path');

const dest = path.join(__dirname, 'yt-dlp');

function download(url) {
    https.get(url, (res) => {
        // GitHub releases yönlendirmelerini (301/302) otomatik takip et
        if (res.statusCode === 301 || res.statusCode === 302) {
            download(res.headers.location);
            return;
        }

        if (res.statusCode !== 200) {
            console.error(`❌ İndirme başarısız. Durum Kodu: ${res.statusCode}`);
            process.exit(1);
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);

        file.on('finish', () => {
            file.close();
            // Linux için çalıştırma izni ver (chmod +x karşılığı)
            fs.chmodSync(dest, '755');
            console.log('✅ yt-dlp motoru başarıyla indirildi ve izinleri ayarlandı!');
            process.exit(0);
        });
    }).on('error', (err) => {
        console.error('❌ Dosya indirilirken hata oluştu:', err.message);
        process.exit(1);
    });
}

console.log('⏳ Resmi GitHub deposundan en güncel Linux yt-dlp motoru çekiliyor...');
download('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp');

const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to fetch text content from URL
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        }).on('error', (err) => { reject(err); });
    });
}

async function archiveDailyTop100() {
    const url = "https://itunes.apple.com/tw/rss/toppodcasts/limit=100/json";
    const dateToday = new Date().toISOString().split('T')[0];
    
    console.log(`[${dateToday}] 正在抓取 Apple Podcasts 當前完整百大榜單...`);
    
    try {
        const resText = await fetchUrl(url);
        const data = JSON.parse(resText);
        const entries = data.feed?.entry || [];
        
        if (entries.length === 0) {
            console.warn("抓取到的榜單資料為空，未寫入檔案。");
            return;
        }
        
        const archiveCsvPath = path.join(__dirname, 'daily_top100_archive.csv');
        let writeHeader = false;
        if (!fs.existsSync(archiveCsvPath)) {
            writeHeader = true;
        }
        
        const stream = fs.createWriteStream(archiveCsvPath, { flags: 'a' });
        if (writeHeader) {
            stream.write("日期,排名,節目名稱,製作人/主持人,分類\n");
        }
        
        const escape = (text) => {
            if (!text) return '""';
            return `"${text.replace(/["\r\n]/g, '""')}"`;
        };
        
        entries.forEach((entry, idx) => {
            const rank = idx + 1;
            const name = entry['im:name']?.label || '';
            const artist = entry['im:artist']?.label || '';
            const category = entry['category']?.attributes?.label || '';
            
            stream.write(`${dateToday},${rank},${escape(name)},${escape(artist)},${escape(category)}\n`);
        });
        
        stream.end();
        console.log(`成功將今日完整 100 名榜單數據封存寫入: daily_top100_archive.csv`);
        
    } catch (e) {
        console.error("封存今日榜單失敗:", e.message);
    }
}

archiveDailyTop100();

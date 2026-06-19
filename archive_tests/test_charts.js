const https = require('https');

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

async function main() {
    console.log("=================== 測試 Apple Podcasts 台灣區 Top 100 榜單 API ===================");
    const url = "https://itunes.apple.com/tw/rss/toppodcasts/limit=100/json";
    
    try {
        const resText = await fetchUrl(url);
        const data = JSON.parse(resText);
        const entries = data.feed?.entry || [];
        
        console.log(`成功抓取榜單！目前共有 ${entries.length} 個節目在 Top 100 內。\n`);
        
        // Print the current Top 10 podcasts in Taiwan
        console.log("🏆 目前台灣區 Apple Podcasts 前 10 名：");
        entries.slice(0, 10).forEach((entry, idx) => {
            const name = entry['im:name']?.label;
            const artist = entry['im:artist']?.label;
            const category = entry['category']?.attributes?.label;
            console.log(`[${idx + 1}] ${name} - 由 ${artist} 製作 (${category})`);
        });
        
        // Let's check if any of our 24 demo podcasts are in the current Top 100!
        const targetPodcasts = [
            "哇賽心理學", "郝聲音", "科技領航家", "電扶梯走左邊", "美股航海王", "精算媽咪的家計簿", "聽進理投"
        ];
        
        console.log("\n🔍 檢查我們的 Demo 節目目前是否在 Top 100 榜單內：");
        let foundCount = 0;
        entries.forEach((entry, idx) => {
            const name = entry['im:name']?.label || '';
            const rank = idx + 1;
            
            targetPodcasts.forEach(target => {
                if (name.includes(target)) {
                    console.log(` -> 🎉 【${target}】目前在榜內！當前排名：第 ${rank} 名 (在榜名稱: ${name})`);
                    foundCount++;
                }
            });
        });
        
        if (foundCount === 0) {
            console.log(" -> 目前無 Demo 節目在 Top 100 內（可能排名有所波動）。");
        }
        
    } catch (e) {
        console.error("❌ 抓取榜單失敗:", e.message);
    }
}

main();

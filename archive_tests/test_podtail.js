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
    console.log("=================== 測試 Podtail 網頁歷史排名抓取 ===================");
    // URL encoded for "哇賽心理學"
    const url = "https://podtail.com/zh-Hant/podcast/%E5%93%87%E8%B3%BD%E5%BF%83%E7%90%86%E5%AD%B8/";
    
    try {
        console.log(`正在抓取: ${url} ...`);
        const html = await fetchUrl(url);
        console.log("HTML 抓取成功！長度:", html.length);
        
        // Search for ranking mentions in text
        // E.g., "在 Apple Podcasts 熱門節目 (台灣) 中排名最高" or similar text
        const rankMatches = html.match(/排名最高[^\d]*(\d+)/) || html.match(/最高[^\d]*(\d+)[^\d]*名/) || html.match(/#\s*(\d+)\s+in/);
        
        console.log("\n🔍 正則搜尋排名結果：");
        if (rankMatches) {
            console.log("找到排名匹配:", rankMatches[0]);
        } else {
            console.log("未在頁面中找到標準的『最高排名』字眼。");
        }
        
        // Let's print some text snippets containing "排名" or "榜" to analyze the structure
        const lines = html.split('\n');
        console.log("\n📄 含有『排名』或『榜』的 HTML 行分析：");
        let found = false;
        lines.forEach((line, idx) => {
            if (line.includes("排名") || line.includes("排行榜") || line.includes("chart") || line.includes("Chart")) {
                console.log(`[Line ${idx}] ${line.trim().substring(0, 150)}`);
                found = true;
            }
        });
        if (!found) console.log("未在 HTML 中找到包含這些關鍵字的行。");
        
    } catch (e) {
        console.error("❌ 抓取失敗:", e.message);
    }
}

main();

const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        }).on('error', (err) => { reject(err); });
    });
}

async function searchApple(term) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=tw&media=podcast&limit=10`;
    const resText = await fetchUrl(url);
    const data = JSON.parse(resText);
    return data.results || [];
}

async function main() {
    console.log("=== 搜尋 '李柏鋒' ===");
    const r1 = await searchApple("李柏鋒");
    r1.forEach(r => console.log(`- ${r.collectionName} | 主持: ${r.artistName} | RSS: ${r.feedUrl}`));

    console.log("\n=== 搜尋 'ActPod' ===");
    const r2 = await searchApple("ActPod");
    r2.forEach(r => console.log(`- ${r.collectionName} | 主持: ${r.artistName} | RSS: ${r.feedUrl}`));

    console.log("\n=== 搜尋 '艾帕' ===");
    const r2b = await searchApple("艾帕");
    r2b.forEach(r => console.log(`- ${r.collectionName} | 主持: ${r.artistName} | RSS: ${r.feedUrl}`));

    console.log("\n=== 搜尋 '辰時' ===");
    const r3 = await searchApple("辰時");
    r3.forEach(r => console.log(`- ${r.collectionName} | 主持: ${r.artistName} | RSS: ${r.feedUrl}`));
}

main();

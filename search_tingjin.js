const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        }).on('error', (err) => { reject(err); });
    });
}

async function main() {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent("聽進理投")}&country=tw&media=podcast&limit=1`;
    const resText = await fetchUrl(url);
    const data = JSON.parse(resText);
    if (data.results && data.results.length > 0) {
        const r = data.results[0];
        console.log(`節目名稱: ${r.collectionName}`);
        console.log(`主持人: ${r.artistName}`);
        console.log(`Apple 網址: ${r.trackViewUrl}`);
        console.log(`RSS 網址: ${r.feedUrl}`);
    } else {
        console.log("未找到 聽進理投");
    }
}

main();

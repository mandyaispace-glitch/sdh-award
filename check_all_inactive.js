const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        }).on('error', (err) => { reject(err); });
    });
}

const urls = {
    "媽媽好神經病": "https://feeds.soundon.fm/podcasts/84685a3b-3017-4627-8d95-827636c46163.xml",
    "我不是病人，我是卡姊！": "https://feeds.soundon.fm/podcasts/d3516c73-a38c-4b5e-a524-9fb1ed1294b3/spotify.xml",
    "金融科技人才培育計劃": "https://feed.firstory.me/rss/user/cl47s8e2i00nn01zg7tyl1nb3"
};

async function main() {
    for (const [name, url] of Object.entries(urls)) {
        try {
            const xml = await fetchUrl(url);
            const dates = [];
            const dateRegex = /<pubDate>(.*?)<\/pubDate>/g;
            let dMatch;
            let count = 0;
            while ((dMatch = dateRegex.exec(xml)) !== null && count < 3) {
                dates.push(dMatch[1]);
                count++;
            }
            console.log(`${name}  senaste 3 pubDates:`, dates);
        } catch (e) {
            console.error(`${name} 失敗:`, e.message);
        }
    }
}

main();

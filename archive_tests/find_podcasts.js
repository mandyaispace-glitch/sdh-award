const https = require('https');
const fs = require('fs');

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

async function searchApplePodcast(term) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=tw&media=podcast&limit=5`;
    try {
        const resText = await fetchUrl(url);
        const data = JSON.parse(resText);
        return data.results || [];
    } catch (e) {
        return [];
    }
}

const partners = [
    { name: "美股夢想家", currentPodcast: "美股夢想家" },
    { name: "主播/主持人 朱楚文", currentPodcast: "" },
    { name: "Dr Selena", currentPodcast: "" },
    { name: "郝旭烈/郝聲音", currentPodcast: "郝聲音" },
    { name: "精算媽咪的家計簿｜珊迪兔", currentPodcast: "精算媽咪的家計簿" },
    { name: "聲音表達講師 林依柔", currentPodcast: "" },
    { name: "張忘形", currentPodcast: "" },
    { name: "李柏鋒的擴大機", currentPodcast: "李柏鋒的擴大機" },
    { name: "崔咪", currentPodcast: "" },
    { name: "哇賽心理學_蔡宇哲", currentPodcast: "哇賽心理學" },
    { name: "Cynthia Huang黃馨儀", currentPodcast: "" },
    { name: "蘇絢慧分享空間", currentPodcast: "蘇絢慧分享空間" },
    { name: "加班當爸媽．櫻桃可可CherryCoco", currentPodcast: "加班當爸媽" },
    { name: "林程揚｜Hank 大叔", currentPodcast: "能量黑客" },
    { name: "美股航海王", currentPodcast: "美股航海王" },
    { name: "宋家小館｜Becky", currentPodcast: "" },
    { name: "莫菲穿搭", currentPodcast: "" },
    { name: "慢活夫妻 Dewi&George", currentPodcast: "" },
    { name: "創才", currentPodcast: "" },
    { name: "電扶梯走左邊", currentPodcast: "電扶梯走左邊" },
    { name: "蕭老師別這樣", currentPodcast: "蕭老師別這樣" },
    { name: "卡姊", currentPodcast: "" },
    { name: "Z研", currentPodcast: "" },
    { name: "ActPod艾帕科技", currentPodcast: "" },
    { name: "辰時生活視覺有限公司", currentPodcast: "" }
];

async function main() {
    const finalResults = [];
    
    for (const partner of partners) {
        const queryName = partner.currentPodcast || partner.name;
        // Clean up title for search
        const cleanQuery = queryName
            .replace(/主播\/主持人\s*/, '')
            .replace(/聲音表達講師\s*/, '')
            .replace(/精算媽咪的家計簿｜珊迪兔/, '精算媽咪的家計簿')
            .replace(/加班當爸媽．櫻桃可可CherryCoco/, '加班當爸媽')
            .replace(/林程揚｜Hank 大叔/, '能量黑客')
            .replace(/哇賽心理學_蔡宇哲/, '哇賽心理學')
            .replace(/慢活夫妻 Dewi&George/, '慢活夫妻')
            .replace(/宋家小館｜Becky/, '宋家小館')
            .replace(/Cynthia Huang黃馨儀/, '黃馨儀')
            .trim();
            
        let results = await searchApplePodcast(cleanQuery);
        
        if (results.length === 0) {
            // Try another variation (e.g. search partner name directly)
            const backupQuery = partner.name.split(/[｜_／/]/)[0].trim();
            if (backupQuery !== cleanQuery) {
                results = await searchApplePodcast(backupQuery);
            }
        }
        
        finalResults.push({
            partnerName: partner.name,
            currentPodcastInSheet: partner.currentPodcast,
            searchQueryUsed: cleanQuery,
            found: results.length > 0,
            matches: results.map(r => ({
                podcastName: r.collectionName,
                artistName: r.artistName,
                appleUrl: r.trackViewUrl,
                rssUrl: r.feedUrl
            }))
        });
    }
    
    fs.writeFileSync('search_results.json', JSON.stringify(finalResults, null, 2), 'utf-8');
    console.log("搜尋完成！已將結果儲存至 search_results.json");
}

main();

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

async function main() {
    const url = "https://www.omnycontent.com/d/playlist/a4cc0a4a-642d-45d7-ac5d-ac5600c620b0/0e26d3df-d582-4b49-8b26-af2400938e98/730b75c2-3f9f-4da7-be56-af240095bbcc/podcast.rss";
    try {
        const xml = await fetchUrl(url);
        console.log("XML Length:", xml.length);
        
        // Print the first item block
        const match = xml.match(/<item>([\s\S]*?)<\/item>/);
        if (match) {
            console.log("First Item XML snippet:\n", match[1].substring(0, 1000));
        } else {
            console.log("No item tag found!");
        }
        
        // Count how many item tags are present
        const itemCount = (xml.match(/<item>/g) || []).length;
        console.log("Total items in XML:", itemCount);
        
        // Let's print some pubDates
        const dates = [];
        const dateRegex = /<pubDate>(.*?)<\/pubDate>/g;
        let dMatch;
        let count = 0;
        while ((dMatch = dateRegex.exec(xml)) !== null && count < 5) {
            dates.push(dMatch[1]);
            count++;
        }
        console.log("First 5 pubDates:", dates);
    } catch (e) {
        console.error(e);
    }
}

main();

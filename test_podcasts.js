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

// Search Apple Podcast by Name
async function searchApplePodcast(name) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&country=tw&media=podcast&limit=1`;
    try {
        const resText = await fetchUrl(url);
        const data = JSON.parse(resText);
        if (data.resultCount > 0) {
            const result = data.results[0];
            return {
                podcastName: result.collectionName,
                appleId: result.collectionId,
                rssUrl: result.feedUrl,
                trackCount: result.trackCount
            };
        }
    } catch (e) {
        console.error(`搜尋 Apple Podcast 失敗 (${name}):`, e.message);
    }
    return null;
}

// Check eligibility from RSS XML
async function checkEligibility(rssUrl, monthsLimit = 6) {
    try {
        const xml = await fetchUrl(rssUrl);
        
        // Find Podcast Title
        const titleMatch = xml.match(/<title>(.*?)<\/title>/);
        const podcastTitle = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : 'Unknown';
        
        // Find all <item> blocks
        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        
        const current_time = new Date("2026-06-14T10:00:00Z"); // Set reference time
        const dateLimit = new Date(current_time.getTime() - (monthsLimit * 30 * 24 * 60 * 60 * 1000));
        
        while ((match = itemRegex.exec(xml)) !== null) {
            const itemContent = match[1];
            const titleM = itemContent.match(/<title>(.*?)<\/title>/);
            const pubDateM = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
            const enclosureM = itemContent.match(/<enclosure[^>]*url="([^"]+)"/);
            
            const title = titleM ? titleM[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
            const pubDateStr = pubDateM ? pubDateM[1] : '';
            const mp3Url = enclosureM ? enclosureM[1] : '';
            
            if (pubDateStr) {
                const pubDate = new Date(pubDateStr);
                if (!isNaN(pubDate.getTime()) && pubDate >= dateLimit) {
                    items.push({
                        title,
                        pubDate: pubDate.toISOString().split('T')[0],
                        mp3Url
                    });
                }
            }
        }
        
        return {
            title: podcastTitle,
            episodesCountPast6Months: items.length,
            eligible: items.length >= 12,
            sampleEpisodes: items.slice(0, 3)
        };
    } catch (e) {
        return { error: e.message };
    }
}

// Fetch Apple Podcast Reviews
async function getAppleReviews(appleId) {
    const url = `https://itunes.apple.com/tw/rss/customerreviews/id=${appleId}/json`;
    try {
        const resText = await fetchUrl(url);
        const data = JSON.parse(resText);
        const entries = data.feed?.entry || [];
        const reviews = [];
        
        // If it's a single entry, it's an object instead of array
        const entriesList = Array.isArray(entries) ? entries : [entries];
        
        for (const entry of entriesList) {
            if (entry.author && entry['im:rating']) {
                reviews.push({
                    author: entry.author.name.label,
                    rating: parseInt(entry['im:rating'].label),
                    title: entry.title.label,
                    content: entry.content.label
                });
            }
        }
        return {
            totalReviewsFound: reviews.length,
            sampleReviews: reviews.slice(0, 3)
        };
    } catch (e) {
        return { error: `取得 Apple 留言失敗: ${e.message}` };
    }
}

// Scrape Spotify rating count and value
async function getSpotifyRatings(spotifyUrl) {
    try {
        const html = await fetchUrl(spotifyUrl);
        
        // Search in JSON-LD scripts
        const ldRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
        let match;
        while ((match = ldRegex.exec(html)) !== null) {
            try {
                const ld = JSON.parse(match[1].trim());
                if (ld.aggregateRating) {
                    return {
                        ratingValue: ld.aggregateRating.ratingValue,
                        ratingCount: ld.aggregateRating.ratingCount
                    };
                }
            } catch (e) {}
        }
        
        // Fallback: search for ratingValue / ratingCount keys in raw HTML strings
        const ratingM = html.match(/"ratingValue"\s*:\s*([0-9.]+)/);
        const countM = html.match(/"ratingCount"\s*:\s*([0-9,]+)/);
        if (ratingM && countM) {
            return {
                ratingValue: parseFloat(ratingM[1]),
                ratingCount: parseInt(countM[1].replace(/,/g, ''))
            };
        }
        
        // Search for Spotify rating display format: e.g. "4.9 (1.2k)" or "4.9 (1,234)"
        const textMatch = html.match(/([0-5]\.[0-9])\s+\(([0-9,kK\s]+)\)/);
        if (textMatch) {
            return {
                ratingValue: parseFloat(textMatch[1]),
                ratingCountRaw: textMatch[2].trim()
            };
        }
        
        return { status: "HTML中未找到 aggregateRating，可能因為未登入或客戶端渲染" };
    } catch (e) {
        return { error: `抓取 Spotify 失敗: ${e.message}` };
    }
}

async function main() {
    console.log("=================== 測試 1: 任性歐逆機智生活 ===================");
    const oniApple = await searchApplePodcast("任性歐逆機智生活");
    console.log("Apple 搜尋結果:\n", JSON.stringify(oniApple, null, 2));
    
    if (oniApple) {
        console.log("\n進行資格審查與集數抽樣...");
        const eligibility = await checkEligibility(oniApple.rssUrl);
        console.log("資格審查結果:\n", JSON.stringify(eligibility, null, 2));
        
        console.log("\n取得 Apple 聽眾留言...");
        const reviews = await getAppleReviews(oniApple.appleId);
        console.log("Apple 留言結果:\n", JSON.stringify(reviews, null, 2));
    }
    
    console.log("\n抓取 Spotify 評分人數...");
    const oniSpotify = await getSpotifyRatings("https://open.spotify.com/show/3RSITJFvOU7hy3VcDKYUBU");
    console.log("Spotify 評分結果:\n", JSON.stringify(oniSpotify, null, 2));
    
    console.log("\n=================== 測試 2: 科技領航家 朱楚文 ===================");
    const chuApple = await searchApplePodcast("科技領航家");
    console.log("Apple 搜尋結果:\n", JSON.stringify(chuApple, null, 2));
    
    if (chuApple) {
        console.log("\n進行資格審查與集數抽樣...");
        const eligibility = await checkEligibility(chuApple.rssUrl);
        console.log("資格審查結果:\n", JSON.stringify(eligibility, null, 2));
        
        console.log("\n取得 Apple 聽眾留言...");
        const reviews = await getAppleReviews("1485503209");
        console.log("Apple 留言結果:\n", JSON.stringify(reviews, null, 2));
    }
    
    console.log("\n抓取 Spotify 評分人數...");
    const chuSpotify = await getSpotifyRatings("https://open.spotify.com/show/7o50v1V5w4oNFRfH6Fnx4f");
    console.log("Spotify 評分結果:\n", JSON.stringify(chuSpotify, null, 2));
}

main();

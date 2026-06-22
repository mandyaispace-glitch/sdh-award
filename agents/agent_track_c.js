const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to fetch text content from URL
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        };
        https.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchUrl(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        }).on('error', (err) => { reject(err); });
    });
}

// 1. Fetch Apple Podcast Reviews and Filter by Date (past 6 months)
async function getAppleReviewsForPodcast(appleId, partnerName, podcastName, monthsLimit = 6) {
    const url = `https://itunes.apple.com/tw/rss/customerreviews/id=${appleId}/json`;
    const referenceDate = new Date("2026-06-14T10:00:00Z");
    const dateLimit = new Date(referenceDate.getTime() - (monthsLimit * 30 * 24 * 60 * 60 * 1000));
    
    try {
        const resText = await fetchUrl(url);
        const data = JSON.parse(resText);
        const entries = data.feed?.entry || [];
        const entriesList = Array.isArray(entries) ? entries : [entries];
        
        const reviewsInRange = [];
        let totalRatingSum = 0;
        
        for (const entry of entriesList) {
            if (entry.author && entry['im:rating'] && entry['im:releaseDate'] === undefined) {
                const reviewDateStr = entry.updated?.label;
                const rating = parseInt(entry['im:rating'].label);
                const author = entry.author.name.label;
                const title = entry.title.label;
                const content = entry.content.label;
                
                let reviewDate = null;
                if (reviewDateStr) {
                    reviewDate = new Date(reviewDateStr);
                }
                
                if (reviewDate && !isNaN(reviewDate.getTime())) {
                    if (reviewDate >= dateLimit) {
                        reviewsInRange.push({
                            author,
                            rating,
                            title,
                            content,
                            date: reviewDate.toISOString().split('T')[0]
                        });
                        totalRatingSum += rating;
                    }
                } else {
                    reviewsInRange.push({
                        author,
                        rating,
                        title,
                        content,
                        date: "Unknown"
                    });
                    totalRatingSum += rating;
                }
            }
        }
        
        const avgRating = reviewsInRange.length > 0 ? Math.round((totalRatingSum / reviewsInRange.length) * 10) / 10 : 0;
        
        return {
            reviewsCount: reviewsInRange.length,
            averageRating: avgRating,
            reviews: reviewsInRange
        };
    } catch (e) {
        return {
            reviewsCount: 0,
            averageRating: 0,
            reviews: [],
            error: e.message
        };
    }
}

// 2. Fetch YouTube stats (Subscribers & Views) via official API
async function getYouTubeStats(partnerName, ytApiKey) {
    if (!ytApiKey) {
        // Return 0 if YT API Key is not configured
        return { subscribers: 0, views: 0, channelName: "N/A (未設定金鑰)" };
    }
    
    try {
        // Step A: Search for the channel by partnerName
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(partnerName)}&key=${ytApiKey}`;
        const searchResText = await fetchUrl(searchUrl);
        const searchData = JSON.parse(searchResText);
        const channelItem = searchData.items?.[0];
        
        if (!channelItem || !channelItem.id?.channelId) {
            return { subscribers: 0, views: 0, channelName: "N/A (未尋獲頻道)" };
        }
        
        const channelId = channelItem.id.channelId;
        const channelName = channelItem.snippet?.title || partnerName;
        
        // Step B: Get channel statistics
        const statsUrl = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${ytApiKey}`;
        const statsResText = await fetchUrl(statsUrl);
        const statsData = JSON.parse(statsResText);
        const stats = statsData.items?.[0]?.statistics;
        
        if (!stats) {
            return { subscribers: 0, views: 0, channelName };
        }
        
        return {
            subscribers: parseInt(stats.subscriberCount || 0),
            views: parseInt(stats.viewCount || 0),
            channelName
        };
    } catch (e) {
        console.error(` ⚠️ 抓取 YouTube [${partnerName}] 出錯:`, e.message);
        return { subscribers: 0, views: 0, channelName: "Error", error: e.message };
    }
}

// 3. Read or create Instagram followers from manual CSV
function getInstagramFollowers(partnerName) {
    const csvPath = path.join(__dirname, '..', 'social_media_manual.csv');
    
    // Auto-create CSV with pre-populated partner names if it doesn't exist
    if (!fs.existsSync(csvPath)) {
        console.log("📝 建立預填之 Instagram 粉絲數手動填寫表 social_media_manual.csv...");
        
        let initialContent = "合作夥伴,Instagram粉絲數\n";
        
        // Load KOL program list if exists to pre-populate names
        const listPath = path.join(__dirname, '..', 'kol_programs_list.json');
        if (fs.existsSync(listPath)) {
            try {
                const list = JSON.parse(fs.readFileSync(listPath, 'utf-8'));
                list.forEach(item => {
                    initialContent += `"${item.partnerName}",0\n`;
                });
            } catch (e) {
                initialContent += `"郝聲音",0\n"哇賽心理學_蔡宇哲",0\n`;
            }
        }
        
        fs.writeFileSync(csvPath, initialContent, 'utf-8');
    }
    
    // Read and parse CSV
    try {
        const lines = fs.readFileSync(csvPath, 'utf-8').split('\n');
        for (const line of lines) {
            if (!line.trim()) continue;
            // Handle quoted fields
            const match = line.match(/^"([^"]+)",(\d+)/) || line.match(/^([^,]+),(\d+)/);
            if (match) {
                const name = match[1].trim();
                const followers = parseInt(match[2].trim());
                if (name === partnerName) {
                    return followers;
                }
            }
        }
    } catch (e) {
        console.error(" ⚠️ 讀取 social_media_manual.csv 失敗:", e.message);
    }
    
    return 0; // Default fallback
}

// Main execution method
async function collectDataForPodcast(pod, ytApiKey) {
    console.log(`   -> [數據收集官] 正在處理: ${pod.partnerName}`);
    
    // 1. Fetch Apple Podcasts Reviews
    let appleId = null;
    if (pod.applePodcastUrl) {
        const idMatch = pod.applePodcastUrl.match(/\/id(\d+)/);
        if (idMatch) appleId = idMatch[1];
    }
    
    let appleData = { reviewsCount: 0, averageRating: 0, reviews: [] };
    if (appleId) {
        appleData = await getAppleReviewsForPodcast(appleId, pod.partnerName, pod.podcastName);
    }
    
    // 2. Fetch YouTube Channel Stats
    const ytData = await getYouTubeStats(pod.partnerName, ytApiKey);
    
    // 3. Get Instagram Followers from manual CSV
    const igFollowers = getInstagramFollowers(pod.partnerName);
    
    return {
        partnerName: pod.partnerName,
        podcastName: pod.podcastName,
        appleId,
        reviewsCount: appleData.reviewsCount,
        averageRating: appleData.averageRating,
        reviews: appleData.reviews,
        youtubeSubscribers: ytData.subscribers,
        youtubeViews: ytData.views,
        youtubeChannelName: ytData.channelName,
        instagramFollowers: igFollowers
    };
}

module.exports = {
    collectDataForPodcast
};

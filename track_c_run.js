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

// Fetch Apple Podcast Reviews and Filter by Date (past 6 months)
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
                // Some elements are the podcast info itself (which lacks author or rating)
                // We also check date if available in entry
                // Wait! In iTunes RSS, the date of review is in entry.updated.label
                const reviewDateStr = entry.updated?.label;
                const rating = parseInt(entry['im:rating'].label);
                const author = entry.author.name.label;
                const title = entry.title.label;
                const content = entry.content.label;
                
                let reviewDate = null;
                if (reviewDateStr) {
                    reviewDate = new Date(reviewDateStr);
                }
                
                // If date is within the last 6 months (or we count it if date parsing fails)
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
                    // Fallback if no date label, we still include it as recent
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
            partnerName,
            podcastName,
            appleId,
            reviewsCount: reviewsInRange.length,
            averageRating: avgRating,
            reviews: reviewsInRange
        };
    } catch (e) {
        return {
            partnerName,
            podcastName,
            appleId,
            reviewsCount: 0,
            averageRating: 0,
            reviews: [],
            error: e.message
        };
    }
}

async function main() {
    console.log("=================== 軌道 C (數據與社群軌) 測試執行 ===================");
    
    const csvPath = path.join(__dirname, 'updated_sheet.csv');
    if (!fs.existsSync(csvPath)) {
        console.error("找不到 updated_sheet.csv 檔案。");
        return;
    }
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split(/\r?\n/);
    const podcasts = [];
    
    // Parse CSV to find Apple Podcast IDs (extracted from Apple Podcast links)
    for (let i = 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        const cells = [];
        let currentCell = '';
        let inQuotes = false;
        for (let charIndex = 0; charIndex < line.length; charIndex++) {
            const char = line[charIndex];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                cells.push(currentCell.trim());
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        cells.push(currentCell.trim());
        
        const partnerName = cells[2] || '';
        const podcastName = cells[9] || '';
        const appleUrl = cells[10] || '';
        
        // Extract Apple ID from URL, e.g. https://podcasts.apple.com/tw/podcast/.../id1485503209
        const idMatch = appleUrl.match(/\/id(\d+)/);
        if (partnerName && idMatch) {
            podcasts.push({
                partnerName,
                podcastName,
                appleId: idMatch[1]
            });
        }
    }
    
    console.log(`共讀取到 ${podcasts.length} 個已配對 Apple ID 的節目。開始抓取聽眾留言數據...\n`);
    
    const results = [];
    for (let i = 0; i < podcasts.length; i++) {
        const pod = podcasts[i];
        console.log(`[${i+1}/${podcasts.length}] 正在抓取: ${pod.partnerName} (${pod.podcastName}) ...`);
        const res = await getAppleReviewsForPodcast(pod.appleId, pod.partnerName, pod.podcastName);
        results.push(res);
        console.log(`   -> 找到 ${res.reviewsCount} 筆過去 6 個月內的留言 (平均評分: ${res.averageRating}★)`);
    }
    
    // Sort by review count descending (for the Most Comments Award)
    results.sort((a, b) => b.reviewsCount - a.reviewsCount);
    
    // Write JSON file
    fs.writeFileSync('track_c_results.json', JSON.stringify(results, null, 2), 'utf-8');
    
    // Generate Markdown Leaderboard
    let md = `# 🏆 軌道 C 數據評選 - 聽眾留言量排行榜 (Demo)\n\n`;
    md += `*   **統計期間**：過去 6 個月內 (以 2026-06-14 為基準回推)\n`;
    md += `*   **數據來源**：Apple Podcasts 台灣區公開聽眾評論 API\n\n`;
    md += `## 📊 聽眾互動留言量排行\n\n`;
    md += `| 排名 | 合作夥伴 | 節目名稱 | 過去 6 個月留言數 | 平均星等 | 狀態 |\n`;
    md += `| :---: | :--- | :--- | :---: | :---: | :---: |\n`;
    
    results.forEach((res, index) => {
        let medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`;
        md += `| ${medal} | ${res.partnerName} | ${res.podcastName} | **${res.reviewsCount}** | ${res.averageRating > 0 ? res.averageRating + ' ★' : '無評分'} | ${res.reviewsCount >= 10 ? '🔥 熱絡' : '穩定'} |\n`;
    });
    
    md += `\n## 💬 部分優質聽眾留言節錄 (展示)\n\n`;
    
    results.forEach(res => {
        if (res.reviewsCount > 0) {
            md += `### 🎙️ ${res.partnerName} - 《${res.podcastName}》\n`;
            res.reviews.slice(0, 2).forEach(rev => {
                md += `*   **聽眾** \`${rev.author}\` (${rev.rating}★)：**「${rev.title}」**\n`;
                md += `    > ${rev.content.replace(/\r?\n/g, '\n    > ')}\n\n`;
            });
        }
    });
    
    fs.writeFileSync('track_c_leaderboard.md', md, 'utf-8');
    console.log(`\n🎉 測試完成！`);
    console.log(`- 留言排行報告已儲存至: track_c_leaderboard.md`);
    console.log(`- 詳細留言 JSON 數據已儲存至: track_c_results.json`);
}

main();

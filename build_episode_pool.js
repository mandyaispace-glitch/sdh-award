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
                // Handle redirect
                return fetchUrl(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        }).on('error', (err) => { reject(err); });
    });
}

// Simple XML parsing of RSS Feed
function parseRssFeed(xml, monthsLimit = 6) {
    const episodes = [];
    
    // Find channel title
    const titleMatch = xml.match(/<title>(.*?)<\/title>/);
    const channelTitle = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : 'Unknown';
    
    // Set 6-month date limit based on reference date 2026-06-14
    const referenceDate = new Date("2026-06-14T10:00:00Z");
    const dateLimit = new Date(referenceDate.getTime() - (monthsLimit * 30 * 24 * 60 * 60 * 1000));
    
    // Extract item blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null) {
        const itemContent = match[1];
        const titleM = itemContent.match(/<title>(.*?)<\/title>/);
        const pubDateM = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
        const enclosureM = itemContent.match(/<enclosure[^>]*url="([^"]+)"/);
        
        const title = titleM ? titleM[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
        const pubDateStr = pubDateM ? pubDateM[1] : '';
        const mp3Url = enclosureM ? enclosureM[1] : '';
        
        // Parse duration
        let durationMinutes = null;
        let durationStr = null;
        const durationM = itemContent.match(/<itunes:duration>(.*?)<\/itunes:duration>/) || itemContent.match(/<duration>(.*?)<\/duration>/);
        if (durationM) durationStr = durationM[1].trim();
        
        if (durationStr) {
            try {
                const parts = durationStr.split(':');
                if (parts.length === 3) {
                    durationMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]) + parseInt(parts[2]) / 60;
                } else if (parts.length === 2) {
                    durationMinutes = parseInt(parts[0]) + parseInt(parts[1]) / 60;
                } else {
                    durationMinutes = parseInt(parts[0]) / 60;
                }
            } catch (e) {}
        }
        
        if (pubDateStr) {
            const pubDate = new Date(pubDateStr);
            if (!isNaN(pubDate.getTime()) && pubDate >= dateLimit) {
                episodes.push({
                    title,
                    pubDate: pubDate.toISOString().split('T')[0],
                    mp3Url,
                    duration: durationMinutes ? Math.round(durationMinutes * 100) / 100 : null
                });
            }
        }
    }
    
    return {
        title: channelTitle,
        episodes
    };
}

async function main() {
    const csvPath = path.join(__dirname, 'updated_sheet.csv');
    if (!fs.existsSync(csvPath)) {
        console.error("找不到 updated_sheet.csv 檔案，請確認位置。");
        return;
    }
    
    console.log("正在讀取 updated_sheet.csv...");
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split(/\r?\n/);
    
    const podcastsToProcess = [];
    
    // Parse CSV rows
    for (let i = 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        // Handle quoted fields
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
        const rssUrl = cells[11] || '';
        
        if (partnerName && rssUrl && rssUrl.startsWith('http')) {
            podcastsToProcess.push({
                partnerName,
                podcastName,
                rssUrl
            });
        }
    }
    
    console.log(`共找到 ${podcastsToProcess.length} 個待審查的 Podcast RSS 頻道。`);
    
    const eligibilityReport = [];
    const masterEpisodePool = [];
    
    for (let i = 0; i < podcastsToProcess.length; i++) {
        const pod = podcastsToProcess[i];
        console.log(`\n[${i + 1}/${podcastsToProcess.length}] 正在處理頻道: ${pod.partnerName} (${pod.podcastName || '未命名'})`);
        
        try {
            const xml = await fetchUrl(pod.rssUrl);
            const { title: parsedTitle, episodes } = parseRssFeed(xml);
            
            const count = episodes.length;
            const isEligible = count >= 12;
            
            console.log(` -> 抓取成功！過去 6 個月共發布了 ${count} 集。符合資格 (>=12集): ${isEligible ? '✅' : '❌'}`);
            
            eligibilityReport.push({
                partnerName: pod.partnerName,
                podcastName: parsedTitle,
                rssUrl: pod.rssUrl,
                episodesCount: count,
                eligible: isEligible,
                reason: isEligible ? "合格" : `集數不足 (僅 ${count} 集)`
            });
            
            if (isEligible) {
                // Add all episodes of this podcast to the master pool
                episodes.forEach(ep => {
                    masterEpisodePool.push({
                        partnerName: pod.partnerName,
                        podcastName: parsedTitle,
                        episodeTitle: ep.title,
                        pubDate: ep.pubDate,
                        duration: ep.duration,
                        mp3Url: ep.mp3Url
                    });
                });
            }
            
        } catch (err) {
            console.error(` -> 抓取失敗: ${err.message}`);
            eligibilityReport.push({
                partnerName: pod.partnerName,
                podcastName: pod.podcastName || "未知",
                rssUrl: pod.rssUrl,
                episodesCount: 0,
                eligible: false,
                reason: `抓取失敗 (${err.message})`
            });
        }
    }
    
    // Write Eligibility Report (Markdown)
    let reportMd = `# SDH Award Podcast 資格審查報告\n\n`;
    reportMd += `*   **審查基準時間**：以 2026-06-14 為準，回推 6 個月。\n`;
    reportMd += `*   **合格門檻**：過去 6 個月發片量 **$\ge 12$ 集**。\n\n`;
    reportMd += `## 審查總覽\n\n`;
    reportMd += `| 序號 | 合作夥伴 | 節目名稱 | 過去 6 個月集數 | 資格判定 | 說明 |\n`;
    reportMd += `| :--- | :--- | :--- | :---: | :---: | :--- |\n`;
    
    eligibilityReport.forEach((rep, idx) => {
        reportMd += `| ${idx + 1} | ${rep.partnerName} | ${rep.podcastName} | ${rep.episodesCount} | ${rep.eligible ? '✅ 合格' : '❌ 不合格'} | ${rep.reason} |\n`;
    });
    
    const reportPath = path.join(__dirname, 'eligibility_report.md');
    fs.writeFileSync(reportPath, reportMd, 'utf-8');
    console.log(`\n審查完成！資格報告已寫入 ${reportPath}`);
    
    // Write Master Episode Pool (CSV)
    let csvHeader = "合作夥伴,節目名稱,單集標題,發布日期,單集長度(分鐘),音檔連結(MP3)\n";
    const csvRows = masterEpisodePool.map(ep => {
        // Escape quotes and commas
        const escape = (text) => {
            if (!text) return '""';
            return `"${text.replace(/"/g, '""')}"`;
        };
        return `${escape(ep.partnerName)},${escape(ep.podcastName)},${escape(ep.episodeTitle)},${escape(ep.pubDate)},${ep.duration || '""'},${escape(ep.mp3Url)}`;
    });
    
    const poolPath = path.join(__dirname, 'eligible_episodes_pool.csv');
    fs.writeFileSync(poolPath, csvHeader + csvRows.join('\n'), 'utf-8');
    console.log(`累計合格集數清單已寫入 ${poolPath} (共 ${masterEpisodePool.length} 集)`);
}

main();

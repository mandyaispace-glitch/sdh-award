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
            timeout: 15000
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

// Simple XML parsing of RSS Feed for 2026/01/01 - 2026/06/30 range
function parseRssFeed(xml) {
    const episodes = [];
    
    // Find channel title
    const titleMatch = xml.match(/<title>(.*?)<\/title>/);
    const channelTitle = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : 'Unknown';
    
    // Set date limits
    const startDate = new Date("2026-01-01T00:00:00Z");
    const endDate = new Date("2026-06-30T23:59:59Z");
    
    // Extract item blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    
    while ((match = itemRegex.exec(xml)) !== null) {
        const itemContent = match[1];
        const titleM = itemContent.match(/<title>(.*?)<\/title>/);
        const pubDateM = itemContent.match(/<pubDate>(.*?)<\/pubDate>/);
        const enclosureM = itemContent.match(/<enclosure[^>]*url="([^"]+)"/);
        const guidM = itemContent.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);
        
        const title = titleM ? titleM[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
        const pubDateStr = pubDateM ? pubDateM[1] : '';
        const mp3Url = enclosureM ? enclosureM[1] : '';
        const guid = guidM ? guidM[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : '';
        
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
            if (!isNaN(pubDate.getTime()) && pubDate >= startDate && pubDate <= endDate) {
                episodes.push({
                    title,
                    pubDate: pubDate.toISOString().split('T')[0],
                    mp3Url,
                    guid,
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
    
    console.log("正在讀取 updated_sheet.csv 名單...");
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
    
    console.log(`共找到 ${podcastsToProcess.length} 個待審查的 Podcast RSS 頻道。開始分析 2026/01/01 - 2026/06/30 期間集數...`);
    
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
            
            console.log(` -> 抓取成功！期間內共發布了 ${count} 集。符合資格 (>=12集): ${isEligible ? '✅' : '❌'}`);
            
            eligibilityReport.push({
                partnerName: pod.partnerName,
                podcastName: parsedTitle,
                rssUrl: pod.rssUrl,
                episodesCount: count,
                eligible: isEligible,
                reason: isEligible ? "合格" : "資格不符 (發片集數不足 12 集)"
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
                        guid: ep.guid,
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
    
    // Sort report: Eligible first, then alphabetically
    eligibilityReport.sort((a, b) => {
        if (a.eligible !== b.eligible) {
            return a.eligible ? -1 : 1;
        }
        return a.partnerName.localeCompare(b.partnerName, 'zh-Hant');
    });

    // Generate Markdown table
    let tableMd = `| 序號 | 合作夥伴 | 節目名稱 | 2026上半年發片量 | 資格判定 | 備註 |\n`;
    tableMd += `| :---: | :--- | :--- | :---: | :---: | :--- |\n`;
    eligibilityReport.forEach((rep, idx) => {
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
        const status = rep.eligible ? "✅ 合格" : "❌ <span class='text-red-500 font-bold'>資格不符</span>";
        tableMd += `| ${medal} | ${rep.partnerName} | ${rep.podcastName} | **${rep.episodesCount}** | ${status} | ${rep.reason} |\n`;
    });

    // Write Eligibility Report (Markdown file)
    let reportMd = `# SDH Award Podcast 資格審查報告\n\n`;
    reportMd += `*   **審查期間**：2026-01-01 至 2026-06-30。\n`;
    reportMd += `*   **合格門檻**：區間發片量 **&ge; 12 集**。\n\n`;
    reportMd += `## 審查總覽\n\n`;
    reportMd += tableMd;
    
    const reportPath = path.join(__dirname, 'eligibility_report.md');
    fs.writeFileSync(reportPath, reportMd, 'utf-8');
    console.log(`\n資格報告已寫入: ${reportPath}`);
    
    // Dynamic integration with podcast_evaluation_workflow.md (local)
    const workflowMdPath = path.join(__dirname, 'podcast_evaluation_workflow.md');
    if (fs.existsSync(workflowMdPath)) {
        let mdContent = fs.readFileSync(workflowMdPath, 'utf-8');
        const startTag = '<!-- ELIGIBILITY_START -->';
        const endTag = '<!-- ELIGIBILITY_END -->';
        const startIndex = mdContent.indexOf(startTag);
        const endIndex = mdContent.indexOf(endTag);
        
        if (startIndex !== -1 && endIndex !== -1) {
            const before = mdContent.substring(0, startIndex + startTag.length);
            const after = mdContent.substring(endIndex);
            const newContent = `${before}\n\n${tableMd}\n${after}`;
            fs.writeFileSync(workflowMdPath, newContent, 'utf-8');
            console.log(`已成功將最新集數審查總表動態注入: ${workflowMdPath}`);
            
            // Also sync to brain directory if exists
            const brainMdPath = path.join('C:', 'Users', 'manma', '.gemini', 'antigravity', 'brain', '991a5cf6-de4b-4f16-a27c-3b4b3f0b2984', 'podcast_evaluation_workflow.md');
            if (fs.existsSync(brainMdPath)) {
                fs.writeFileSync(brainMdPath, newContent, 'utf-8');
                console.log(`已同步注入腦庫目錄: ${brainMdPath}`);
            }
        }
    }
    
    // Write Master Episode Pool (CSV)
    let csvHeader = "合作夥伴,節目名稱,單集標題,發布日期,單集長度(分鐘),單集識別碼(GUID),音檔連結(MP3)\n";
    const csvRows = masterEpisodePool.map(ep => {
        const escape = (text) => {
            if (!text) return '""';
            return `"${text.replace(/"/g, '""')}"`;
        };
        return `${escape(ep.partnerName)},${escape(ep.podcastName)},${escape(ep.episodeTitle)},${escape(ep.pubDate)},${ep.duration || '""'},${escape(ep.guid)},${escape(ep.mp3Url)}`;
    });
    
    const poolPath = path.join(__dirname, 'eligible_episodes_pool.csv');
    fs.writeFileSync(poolPath, csvHeader + csvRows.join('\n'), 'utf-8');
    console.log(`累計合格集數清單 (含GUID) 已寫入: ${poolPath} (共 ${masterEpisodePool.length} 集)`);
}

main();

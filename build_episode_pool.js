const fs = require('fs');
const path = require('path');
const https = require('https');
const XLSX = require('xlsx');

// Helper to fetch text content from URL
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000
        };
        https.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Handle redirect
                return fetchUrl(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP status ${res.statusCode}`));
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
    const listPath = path.join(__dirname, 'kol_programs_list.json');
    const excelOutputPath = path.join(__dirname, 'eligible_episodes_pool.xlsx');
    
    let podcastsToProcess = [];
    
    // Check if Excel already exists to read '合作名單' as source of truth
    if (fs.existsSync(excelOutputPath)) {
        console.log("偵測到已存在的 Excel 檔案，正在從「合作名單」頁籤讀取資料作為事實來源 (Source of Truth)...");
        try {
            const workbook = XLSX.readFile(excelOutputPath);
            const wsCoop = workbook.Sheets["合作名單"];
            if (wsCoop) {
                const rawRows = XLSX.utils.sheet_to_json(wsCoop);
                podcastsToProcess = rawRows.map(row => {
                    const hasPodcast = row["是否有Podcast節目"] === "是" || row["是否有Podcast節目"] === "true" || row["是否有Podcast節目"] === true;
                    return {
                        partnerName: row["合作夥伴"] || "",
                        podcastName: (row["節目名稱"] === "無" || !row["節目名稱"]) ? "" : row["節目名稱"],
                        applePodcastUrl: row["Apple Podcast 連結"] || "",
                        rssUrl: hasPodcast ? (row["RSS 連結"] || "") : ""
                    };
                });
                console.log(`成功自 Excel「合作名單」加載 ${podcastsToProcess.length} 筆合作夥伴資料！`);
            }
        } catch (err) {
            console.warn(`讀取 Excel 失敗 (${err.message})，將改用 JSON 檔案作為來源。`);
        }
    }
    
    if (podcastsToProcess.length === 0) {
        if (!fs.existsSync(listPath)) {
            console.error("找不到 kol_programs_list.json 檔案，請先執行 extract_programs.js。");
            return;
        }
        console.log("正在讀取 kol_programs_list.json 名單...");
        podcastsToProcess = JSON.parse(fs.readFileSync(listPath, 'utf-8'));
        console.log(`共載入 ${podcastsToProcess.length} 個 KOL 節目。`);
    }
    
    const eligibilityReport = [];
    const masterEpisodePool = [];
    
    for (let i = 0; i < podcastsToProcess.length; i++) {
        const pod = podcastsToProcess[i];
        console.log(`\n[${i + 1}/${podcastsToProcess.length}] 正在處理: ${pod.partnerName} (${pod.podcastName || '無 Podcast'})`);
        
        // If there is no RSS URL, mark as ineligible immediately
        if (!pod.rssUrl || !pod.rssUrl.startsWith('http')) {
            console.log(` -> 該 KOL 沒有 Podcast 節目，直接判定為不符合資格。`);
            eligibilityReport.push({
                partnerName: pod.partnerName,
                podcastName: pod.podcastName || "無",
                rssUrl: pod.rssUrl || "",
                applePodcastUrl: pod.applePodcastUrl || "",
                episodesCount: 0,
                eligible: false,
                reason: "資格不符 (無 Podcast 節目)"
            });
            continue;
        }
        
        try {
            const xml = await fetchUrl(pod.rssUrl);
            const { title: parsedTitle, episodes } = parseRssFeed(xml);
            
            const count = episodes.length;
            const isEligible = count >= 12;
            
            console.log(` -> 抓取成功！期間內共發布了 ${count} 集。符合資格 (>=12集): ${isEligible ? '✅' : '❌'}`);
            
            // Update the podcast name with the real one parsed from RSS if available
            const finalPodcastName = parsedTitle && parsedTitle !== 'Unknown' ? parsedTitle : (pod.podcastName || '未知');
            
            eligibilityReport.push({
                partnerName: pod.partnerName,
                podcastName: finalPodcastName,
                rssUrl: pod.rssUrl,
                applePodcastUrl: pod.applePodcastUrl || "",
                episodesCount: count,
                eligible: isEligible,
                reason: isEligible ? "合格" : "資格不符 (發片集數不足 12 集)"
            });
            
            if (isEligible) {
                // Add all episodes of this podcast to the master pool
                episodes.forEach(ep => {
                    masterEpisodePool.push({
                        partnerName: pod.partnerName,
                        podcastName: finalPodcastName,
                        episodeTitle: ep.title,
                        pubDate: ep.pubDate,
                        duration: ep.duration,
                        guid: ep.guid,
                        mp3Url: ep.mp3Url,
                        applePodcastUrl: pod.applePodcastUrl || "",
                        rssUrl: pod.rssUrl || ""
                    });
                });
            }
            
        } catch (err) {
            console.error(` -> 抓取失敗: ${err.message}`);
            eligibilityReport.push({
                partnerName: pod.partnerName,
                podcastName: pod.podcastName || "未知",
                rssUrl: pod.rssUrl,
                applePodcastUrl: pod.applePodcastUrl || "",
                episodesCount: 0,
                eligible: false,
                reason: `抓取失敗 (${err.message})`
            });
        }
        
        // Add a minor delay between fetches to be safe
        await new Promise(r => setTimeout(r, 100));
    }
    
    // Sort report: Episode count descending, then alphabetically by partner name
    eligibilityReport.sort((a, b) => {
        if (b.episodesCount !== a.episodesCount) {
            return b.episodesCount - a.episodesCount;
        }
        return a.partnerName.localeCompare(b.partnerName, 'zh-Hant');
    });

    // Write Multi-Tab Excel using xlsx library
    console.log("\n正在建立多頁籤 Excel 檔案 (eligible_episodes_pool.xlsx)...");
    const wb = XLSX.utils.book_new();
    
    // Tab 1: 合作名單 (包含所有KOL，標註是否有Podcast節目)
    const sheetCoopData = podcastsToProcess.map((pod, idx) => ({
        "序號": idx + 1,
        "合作夥伴": pod.partnerName,
        "節目名稱": pod.rssUrl ? pod.podcastName : "無",
        "是否有Podcast節目": pod.rssUrl ? "是" : "否",
        "Apple Podcast 連結": pod.applePodcastUrl || "",
        "RSS 連結": pod.rssUrl || ""
    }));
    const wsCoop = XLSX.utils.json_to_sheet(sheetCoopData);
    XLSX.utils.book_append_sheet(wb, wsCoop, "合作名單");
    
    // Tab 2: KOL 節目名單 (僅供比對用，保留舊有格式)
    const sheet1Data = podcastsToProcess.map((pod, idx) => ({
        "序號": idx + 1,
        "合作夥伴": pod.partnerName,
        "節目名稱": pod.podcastName,
        "Apple Podcast 連結": pod.applePodcastUrl || "",
        "RSS 連結": pod.rssUrl || "",
        "備註": (!pod.rssUrl) ? "非 Podcast 創作者" : ""
    }));
    const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
    XLSX.utils.book_append_sheet(wb, ws1, "KOL 節目名單");
    
    // Tab 3: 合格單集池
    const sheet2Data = masterEpisodePool.map(ep => ({
        "合作夥伴": ep.partnerName,
        "節目名稱": ep.podcastName,
        "單集標題": ep.episodeTitle,
        "發布日期": ep.pubDate,
        "單集長度(分鐘)": ep.duration !== null ? ep.duration : "",
        "單集識別碼(GUID)": ep.guid,
        "音檔連結(MP3)": ep.mp3Url,
        "Apple Podcast 連結": ep.applePodcastUrl || "",
        "RSS 連結": ep.rssUrl || ""
    }));
    const ws2 = XLSX.utils.json_to_sheet(sheet2Data);
    XLSX.utils.book_append_sheet(wb, ws2, "合格單集池");
    
    // Tab 4: 發片量統計與資格判定
    const sheet3Data = eligibilityReport.map((rep, idx) => ({
        "序號": idx + 1,
        "合作夥伴": rep.partnerName,
        "節目名稱": rep.podcastName,
        "2026上半年發片量": rep.episodesCount,
        "資格判定": rep.eligible ? "合格" : "資格不符",
        "原因": rep.reason,
        "Apple Podcast 連結": rep.applePodcastUrl || "",
        "RSS 連結": rep.rssUrl || ""
    }));
    const ws3 = XLSX.utils.json_to_sheet(sheet3Data);
    XLSX.utils.book_append_sheet(wb, ws3, "發片量統計與資格判定");
    XLSX.writeFile(wb, excelOutputPath);
    console.log(`多頁籤 Excel 檔案已寫入: ${excelOutputPath} (共 ${masterEpisodePool.length} 集)`);

    // Write Eligibility Report (Markdown file)
    console.log("正在產生 Markdown 資格報告...");
    let tableMd = `| 序號 | 合作夥伴 | 節目名稱 | 2026上半年發片量 | 資格判定 | 備註 |\n`;
    tableMd += `| :---: | :--- | :--- | :---: | :---: | :--- |\n`;
    eligibilityReport.forEach((rep, idx) => {
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`;
        const status = rep.eligible ? "✅ 合格" : "❌ <span class='text-red-500 font-bold'>資格不符</span>";
        tableMd += `| ${medal} | ${rep.partnerName} | ${rep.podcastName} | **${rep.episodesCount}** | ${status} | ${rep.reason} |\n`;
    });

    let reportMd = `# SDH Award Podcast 資格審查報告\n\n`;
    reportMd += `*   **審查期間**：2026-01-01 至 2026-06-30。\n`;
    reportMd += `*   **合格門檻**：區間發片量 **&ge; 12 集**。\n\n`;
    reportMd += `## 審查總覽\n\n`;
    reportMd += tableMd;
    
    const reportPath = path.join(__dirname, 'eligibility_report.md');
    fs.writeFileSync(reportPath, reportMd, 'utf-8');
    console.log(`資格報告已寫入: ${reportPath}`);
    
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
    
    // Write statistics to eligibility_stats.json for Chart.js
    const eligibleCount = eligibilityReport.filter(rep => rep.eligible).length;
    const ineligibleCount = eligibilityReport.length - eligibleCount;
    const totalKols = eligibilityReport.length;
    const hasPodcastCount = eligibilityReport.filter(rep => rep.rssUrl && rep.rssUrl.startsWith('http')).length;
    
    const stats = {
        summary: {
            totalKols: totalKols,
            hasPodcastCount: hasPodcastCount,
            totalPrograms: eligibilityReport.length,
            eligiblePrograms: eligibleCount,
            ineligiblePrograms: ineligibleCount,
            totalEpisodes: masterEpisodePool.length
        },
        programs: eligibilityReport.map(rep => ({
            partnerName: rep.partnerName,
            podcastName: rep.podcastName,
            episodesCount: rep.episodesCount,
            eligible: rep.eligible,
            reason: rep.reason
        }))
    };
    
    const statsPath = path.join(__dirname, 'eligibility_stats.json');
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf-8');
    console.log(`圖表統計數據已寫入: ${statsPath}`);
}

main().catch(err => {
    console.error("Error running build_episode_pool:", err);
});

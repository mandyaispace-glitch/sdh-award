const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const workspaceDir = __dirname;
const XLSX = require('xlsx');

console.log("=== 1. 執行 build_episode_pool.js 更新合格名單與 Apple 榜單歷史排行 ===");
try {
    execSync('node build_episode_pool.js', { cwd: workspaceDir, stdio: 'inherit' });
} catch (e) {
    console.error("執行 build_episode_pool.js 失敗:", e.message);
    process.exit(1);
}

console.log("\n=== 2. 讀取快取並寫回 Excel 聲音與社群評估分頁 ===");
const cacheBPath = path.join(workspaceDir, 'track_b_results.json');
const cacheCPath = path.join(workspaceDir, 'track_c_results.json');
const excelPath = path.join(workspaceDir, 'eligible_episodes_pool.xlsx');

if (!fs.existsSync(excelPath)) {
    console.error("找不到 Excel 檔案:", excelPath);
    process.exit(1);
}

try {
    const workbook = XLSX.readFile(excelPath);
    
    // A. 寫入聲音物理評估
    if (fs.existsSync(cacheBPath)) {
        const trackBCache = JSON.parse(fs.readFileSync(cacheBPath, 'utf-8'));
        console.log(`載入聲音物理快取: ${Object.keys(trackBCache).length} 筆`);
        
        if (workbook.Sheets["聲音物理評估"]) {
            delete workbook.Sheets["聲音物理評估"];
            const idx = workbook.SheetNames.indexOf("聲音物理評估");
            if (idx > -1) workbook.SheetNames.splice(idx, 1);
        }
        
        const excelBRows = [];
        const cacheBItems = Object.values(trackBCache);
        cacheBItems.sort((a, b) => a.partnerName.localeCompare(b.partnerName, 'zh-Hant'));
        
        cacheBItems.forEach(item => {
            const seg1 = item.recommended_segments?.[0] || {};
            const seg2 = item.recommended_segments?.[1] || {};
            const seg3 = item.recommended_segments?.[2] || {};
            excelBRows.push({
                "合作夥伴": item.partnerName,
                "節目名稱": item.podcastName,
                "單集標題": item.title,
                "語速 (字/分)": item.speech_rate_wpm,
                "贅字等級": item.filler_words_level,
                "贅字分析": item.filler_words_analysis,
                "聲音共鳴特質": item.vocal_resonance,
                "錄音品質等級": item.acoustic_quality_level,
                "製播缺陷-噴麥": item.acoustic_issues_popping,
                "製播缺陷-爆音": item.acoustic_issues_clipping,
                "製播缺陷-環境底噪": item.acoustic_issues_noise,
                "音質整體說明": item.acoustic_summary,
                "推薦片段一標題": seg1.title || "N/A",
                "推薦片段一區間": seg1.time_range || "N/A",
                "推薦片段一理由": seg1.reason || "N/A",
                "推薦片段二標題": seg2.title || "N/A",
                "推薦片段二區間": seg2.time_range || "N/A",
                "推薦片段二理由": seg2.reason || "N/A",
                "推薦片段三標題": seg3.title || "N/A",
                "推薦片段三區間": seg3.time_range || "N/A",
                "推薦片段三理由": seg3.reason || "N/A",
                "評估時間": item.analyzed_at
            });
        });
        const wsB = XLSX.utils.json_to_sheet(excelBRows);
        XLSX.utils.book_append_sheet(workbook, wsB, "聲音物理評估");
    }
    
    // B. 寫入社群聲量評估
    if (fs.existsSync(cacheCPath)) {
        const trackCCache = JSON.parse(fs.readFileSync(cacheCPath, 'utf-8'));
        console.log(`載入社群聲量快取: ${trackCCache.length} 筆`);
        
        if (workbook.Sheets["社群聲量評估"]) {
            delete workbook.Sheets["社群聲量評估"];
            const idx = workbook.SheetNames.indexOf("社群聲量評估");
            if (idx > -1) workbook.SheetNames.splice(idx, 1);
        }
        
        const excelCRows = [];
        trackCCache.sort((a, b) => a.partnerName.localeCompare(b.partnerName, 'zh-Hant'));
        trackCCache.forEach(item => {
            excelCRows.push({
                "合作夥伴": item.partnerName,
                "節目名稱": item.podcastName,
                "Apple Podcast 留言數": item.reviewsCount,
                "Apple Podcast 平均評分": item.averageRating,
                "YouTube 頻道名稱": item.youtubeChannelName || "N/A",
                "YouTube 訂閱數": item.youtubeSubscribers || 0,
                "YouTube 總觀看量": item.youtubeViews || 0,
                "Instagram 粉絲數": item.instagramFollowers || 0,
                "評估時間": new Date().toISOString()
            });
        });
        const wsC = XLSX.utils.json_to_sheet(excelCRows);
        XLSX.utils.book_append_sheet(workbook, wsC, "社群聲量評估");
    }
    
    XLSX.writeFile(workbook, excelPath);
    console.log("Excel 聲音與社群評估分頁更新成功！");
} catch (err) {
    console.error("更新 Excel 失敗:", err.message);
    process.exit(1);
}

console.log("\n=== 3. 執行 generate_html.js 編譯最新 HTML 儀表板 ===");
try {
    execSync('node generate_html.js', { cwd: workspaceDir, stdio: 'inherit' });
    console.log("\n🎉 排行榜與數據全面同步更新成功！請開啟 podcast_evaluation_workflow.html 查看成果！");
} catch (e) {
    console.error("執行 generate_html.js 失敗:", e.message);
}

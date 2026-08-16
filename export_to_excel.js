const fs = require('fs');
const XLSX = require('xlsx');

// 讀取 JSON 結果
const data = JSON.parse(fs.readFileSync('awards_top10_results.json', 'utf8'));
const episodes = JSON.parse(fs.readFileSync('selected_episodes_full.json', 'utf8'));

// 建立 Episode URL 查找表
const urlMap = new Map();
episodes.forEach(ep => {
    urlMap.set(ep.title, ep.mp3Url);
});

// 建立 Workbook
const wb = XLSX.utils.book_new();

// 遍歷所有獎項，為每個獎項建立一個獨立的 Worksheet
for (const [awardKey, awardObj] of Object.entries(data.awards)) {
    const awardName = awardObj.award_name;
    const ranking = awardObj.ranking;
    
    const excelData = [];
    
    ranking.forEach(r => {
        const segments = r.segments || [];
        
        // Group segments by episodeTitle
        const epGroups = {};
        segments.forEach(seg => {
            const epTitle = seg.episodeTitle || "未知單集";
            if (!epGroups[epTitle]) {
                epGroups[epTitle] = [];
            }
            epGroups[epTitle].push(seg);
        });
        
        const epTitles = Object.keys(epGroups);
        
        if (epTitles.length === 0) {
            // No segments at all
            excelData.push({
                "名次 (Rank)": r.rank,
                "節目名稱 (Podcast)": r.podcastName || "",
                "主持人/夥伴 (Partner)": r.partnerName || "",
                "AI評分/綜合指標 (Score)": typeof r.score === 'number' ? Number(r.score.toFixed(2)) : r.score,
                "整體評選理由 (Reason)": r.reason,
                "推薦單集標題 (Episode Title)": "",
                "當集網址 (Episode URL)": ""
            });
        } else {
            // 每集一列
            epTitles.forEach((epTitle, index) => {
                const segs = epGroups[epTitle];
                const epUrl = urlMap.has(epTitle) ? urlMap.get(epTitle) : "";
                
                const row = {
                    "名次 (Rank)": index === 0 ? r.rank : "", // 只有第一列顯示名次
                    "節目名稱 (Podcast)": index === 0 ? (r.podcastName || "") : "",
                    "主持人/夥伴 (Partner)": index === 0 ? (r.partnerName || "") : "",
                    "AI評分/綜合指標 (Score)": index === 0 ? (typeof r.score === 'number' ? Number(r.score.toFixed(2)) : r.score) : "",
                    "整體評選理由 (Reason)": index === 0 ? r.reason : "",
                    "推薦單集標題 (Episode Title)": epTitle,
                    "當集網址 (Episode URL)": epUrl
                };
                
                // 動態加入最多 3 個推薦片段欄位 (僅保留時間)
                for (let i = 0; i < 3; i++) {
                    const num = i + 1;
                    if (segs[i]) {
                        row[`推薦片段 ${num} 時間`] = segs[i].timeRange || "";
                    } else {
                        row[`推薦片段 ${num} 時間`] = "";
                    }
                }
                
                excelData.push(row);
            });
        }
    });
    
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    const wscols = [
        {wch: 10}, // 名次
        {wch: 25}, // 節目名稱
        {wch: 20}, // 主持人
        {wch: 15}, // 分數
        {wch: 60}, // 整體理由
        {wch: 50}, // 單集標題
        {wch: 60}, // 網址
        {wch: 20}, // 片段 1 時間
        {wch: 20}, // 片段 2 時間
        {wch: 20}  // 片段 3 時間
    ];
    ws['!cols'] = wscols;
    
    // 清洗 Sheet 名稱
    let sheetName = awardName.replace(/[\\/?*[\]]/g, '').substring(0, 31);
    
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

// 讀取評選定義
let definitionsRows = [];
try {
    const defText = fs.readFileSync('award_definitions.md', 'utf8');
    const lines = defText.split('\n');
    let currentAward = "";
    let currentDesc = "";
    
    for (let line of lines) {
        if (line.startsWith('### ')) {
            if (currentAward) {
                definitionsRows.push({"大會獎項": currentAward, "評選定義與細則 (AI 評審指標)": currentDesc.trim()});
            }
            currentAward = line.replace('### ', '').trim();
            currentDesc = "";
        } else if (currentAward && line.trim() !== '') {
            currentDesc += line + "\n";
        }
    }
    if (currentAward) {
        definitionsRows.push({"大會獎項": currentAward, "評選定義與細則 (AI 評審指標)": currentDesc.trim()});
    }
} catch (e) {
    console.error("無法讀取 award_definitions.md", e);
}

const wsDef = XLSX.utils.json_to_sheet(definitionsRows);
wsDef['!cols'] = [{wch: 40}, {wch: 150}];
XLSX.utils.book_append_sheet(wb, wsDef, "評選定義與細則");

const outputPath = 'Awards_Top10_Results_Tabs_v5.xlsx';
XLSX.writeFile(wb, outputPath);

console.log(`✅ Excel 檔案已成功生成，精簡欄位版: ${outputPath}`);

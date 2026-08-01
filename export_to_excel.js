const fs = require('fs');
const XLSX = require('xlsx');

// 讀取 JSON 結果
const data = JSON.parse(fs.readFileSync('awards_top10_results.json', 'utf8'));

// 準備 Excel 數據
const excelData = [];

// 遍歷所有獎項
for (const [awardKey, awardObj] of Object.entries(data.awards)) {
    const awardName = awardObj.award_name;
    const ranking = awardObj.ranking;
    
    ranking.forEach(r => {
        let segStr = "";
        const seg = r.segments?.[0];
        if (seg && seg.timeRange) {
            segStr = `【${seg.title}】\n時間: ${seg.timeRange}\n單集: ${seg.episodeTitle || '該節目'}\n理由: ${seg.reason || ''}`;
        }
        excelData.push({
            "獎項 (Award)": awardName,
            "名次 (Rank)": r.rank,
            "節目名稱 (Podcast)": r.podcastName || "",
            "主持人/夥伴 (Partner)": r.partnerName || "",
            "AI評分/綜合指標 (Score)": r.score,
            "評選理由 (Reason)": r.reason,
            "最推薦聆聽片段 (Recommended Segment)": segStr
        });
    });
}

// 建立 Workbook
const wb = XLSX.utils.book_new();

// 將 JSON 轉為 Worksheet
const ws = XLSX.utils.json_to_sheet(excelData);

// 設定欄寬
const wscols = [
    {wch: 35}, // 獎項
    {wch: 10}, // 名次
    {wch: 30}, // 節目名稱
    {wch: 25}, // 主持人
    {wch: 20}, // 分數
    {wch: 80}, // 理由
    {wch: 70}  // 推薦片段
];
ws['!cols'] = wscols;

// 將 Worksheet 加入 Workbook
XLSX.utils.book_append_sheet(wb, ws, "評選決審 Top 10");

// 輸出 Excel 檔案

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

// 將評選定義轉為 Worksheet
const wsDef = XLSX.utils.json_to_sheet(definitionsRows);
wsDef['!cols'] = [{wch: 40}, {wch: 150}];
XLSX.utils.book_append_sheet(wb, wsDef, "評選定義與細則");

const outputPath = 'Awards_Top10_Results.xlsx';
XLSX.writeFile(wb, outputPath);

console.log(`✅ Excel 檔案已成功生成: ${outputPath}`);

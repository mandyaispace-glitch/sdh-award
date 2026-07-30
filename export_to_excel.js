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
        excelData.push({
            "獎項 (Award)": awardName,
            "名次 (Rank)": r.rank,
            "節目名稱 (Podcast)": r.podcastName || "",
            "主持人/夥伴 (Partner)": r.partnerName || "",
            "AI評分/綜合指標 (Score)": r.score,
            "評選理由 (Reason)": r.reason
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
    {wch: 100} // 理由
];
ws['!cols'] = wscols;

// 將 Worksheet 加入 Workbook
XLSX.utils.book_append_sheet(wb, ws, "評選決審 Top 10");

// 輸出 Excel 檔案
const outputPath = 'Awards_Top10_Results.xlsx';
XLSX.writeFile(wb, outputPath);

console.log(`✅ Excel 檔案已成功生成: ${outputPath}`);

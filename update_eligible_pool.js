const fs = require('fs');
const XLSX = require('xlsx');

// 1. Read the JSON with sampled episodes and the evaluation results
const episodes = JSON.parse(fs.readFileSync('selected_episodes_full.json', 'utf8'));
const evalResults = JSON.parse(fs.readFileSync('track_b_results.json', 'utf8')); // Contains golden_segment_time

// Group by podcastName
const grouped = {};
for (const ep of episodes) {
    const podcast = ep.podcastName || ep.partnerName;
    if (!grouped[podcast]) {
        grouped[podcast] = [];
    }
    grouped[podcast].push(ep);
}

// Prepare Excel data
const excelData = [];
for (const [podcast, eps] of Object.entries(grouped)) {
    const row = {
        "節目名稱": podcast
    };
    
    for (let i = 0; i < 3; i++) {
        const num = i + 1;
        if (eps[i]) {
            const title = eps[i].title;
            row[`單集標題 ${num}`] = title;
            row[`單集網址 ${num}`] = eps[i].mp3Url;
            
            // Try to find the golden segment in track_b_results
            const res = evalResults[title];
            if (res) {
                row[`推薦片段時間 ${num}`] = res.golden_segment_time || 'N/A';
                row[`推薦片段理由 ${num}`] = res.golden_segment_reason || 'N/A';
            } else {
                row[`推薦片段時間 ${num}`] = 'N/A';
                row[`推薦片段理由 ${num}`] = 'N/A';
            }
        } else {
            row[`單集標題 ${num}`] = "";
            row[`單集網址 ${num}`] = "";
            row[`推薦片段時間 ${num}`] = "";
            row[`推薦片段理由 ${num}`] = "";
        }
    }
    
    excelData.push(row);
}

// Create Worksheet
const ws = XLSX.utils.json_to_sheet(excelData);

// Set column widths
ws['!cols'] = [
    {wch: 30}, // 節目名稱
    {wch: 50}, // 標題 1
    {wch: 80}, // 網址 1
    {wch: 25}, // 時間 1
    {wch: 50}, // 理由 1
    {wch: 50}, // 標題 2
    {wch: 80}, // 網址 2
    {wch: 25}, // 時間 2
    {wch: 50}, // 理由 2
    {wch: 50}, // 標題 3
    {wch: 80}, // 網址 3
    {wch: 25}, // 時間 3
    {wch: 50}  // 理由 3
];

// 2. Read the existing Excel file
const inputPath = 'eligible_episodes_pool.xlsx';
let wb;
try {
    wb = XLSX.readFile(inputPath);
} catch (e) {
    console.error(`Failed to read ${inputPath}:`, e);
    process.exit(1);
}

// 3. Append or overwrite the new worksheet
const newSheetName = "抽樣的3集網址";
if (wb.SheetNames.includes(newSheetName)) {
    wb.Sheets[newSheetName] = ws; // Overwrite
    console.log(`Overwrote existing sheet: ${newSheetName}`);
} else {
    XLSX.utils.book_append_sheet(wb, ws, newSheetName);
    console.log(`Appended new sheet: ${newSheetName}`);
}

// 4. Save the Excel file
try {
    XLSX.writeFile(wb, inputPath);
    console.log(`✅ Successfully updated ${inputPath} with the sampled episodes and evaluation segments.`);
} catch (err) {
    console.error(`Error saving ${inputPath}: ${err.message}. Please make sure the file is not open in Excel.`);
    process.exit(1);
}

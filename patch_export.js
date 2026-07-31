const fs = require('fs');
let code = fs.readFileSync('export_to_excel.js', 'utf8');

if (!code.includes('award_definitions.md')) {
    const addSheetCode = `
// 讀取評選定義
let definitionsRows = [];
try {
    const defText = fs.readFileSync('award_definitions.md', 'utf8');
    const lines = defText.split('\\n');
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
            currentDesc += line + "\\n";
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
`;

    code = code.replace('const outputPath = \'Awards_Top10_Results.xlsx\';', addSheetCode + '\nconst outputPath = \'Awards_Top10_Results.xlsx\';');
    fs.writeFileSync('export_to_excel.js', code, 'utf8');
    console.log("export_to_excel.js patched successfully.");
} else {
    console.log("export_to_excel.js already patched.");
}

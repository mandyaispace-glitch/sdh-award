const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

async function main() {
    const excelPath = path.join(__dirname, 'eligible_episodes_pool.xlsx');
    const outputPath = path.join(__dirname, 'selected_episodes_full.json');

    if (!fs.existsSync(excelPath)) {
        console.error(`❌ 找不到 Excel 資料庫：${excelPath}`);
        process.exit(1);
    }

    console.log("正在讀取 Excel 單集池...");
    const workbook = XLSX.readFile(excelPath);
    const ws = workbook.Sheets["合格單集池"];
    if (!ws) {
        console.error("❌ 找不到「合格單集池」工作表。");
        process.exit(1);
    }

    const allEpisodes = XLSX.utils.sheet_to_json(ws);
    console.log(`成功讀取「合格單集池」，共 ${allEpisodes.length} 筆單集。`);

    // Get all unique eligible partners
    const partners = [...new Set(allEpisodes.map(ep => ep["合作夥伴"]))].filter(Boolean);
    console.log(`在單集池中找到 ${partners.length} 個合格合作夥伴。`);

    const selectedEpisodes = [];

    partners.forEach(partner => {
        // Filter episodes for this partner
        const partnerEps = allEpisodes.filter(ep => ep["合作夥伴"] === partner);
        if (partnerEps.length === 0) return;

        // Shuffle episodes randomly
        const shuffled = [...partnerEps].sort(() => 0.5 - Math.random());

        // Select up to 3 episodes
        const selected = shuffled.slice(0, 3);
        selected.forEach(ep => {
            selectedEpisodes.push({
                partnerName: ep["合作夥伴"],
                podcastName: ep["節目名稱"] || "無",
                title: ep["單集標題"],
                mp3Url: ep["音檔連結(MP3)"]
            });
        });
    });

    // Save to selected_episodes_full.json
    fs.writeFileSync(outputPath, JSON.stringify(selectedEpisodes, null, 2), 'utf-8');
    console.log(`\n🎉 隨機抽樣完成！`);
    console.log(`- 合作夥伴總數: ${partners.length} 檔`);
    console.log(`- 抽樣單集總數: ${selectedEpisodes.length} 集 (理想狀況應為 ${partners.length * 3} 集)`);
    console.log(`- 名單已存檔至: ${outputPath}`);

    // Print breakdown
    const partnerCounts = {};
    selectedEpisodes.forEach(ep => {
        partnerCounts[ep.partnerName] = (partnerCounts[ep.partnerName] || 0) + 1;
    });
    console.log("\n抽樣分布明細：");
    Object.entries(partnerCounts).forEach(([partner, count]) => {
        console.log(`  - ${partner}: 抽中 ${count} 集`);
    });
}

main().catch(err => {
    console.error("執行抽樣失敗：", err.message);
});

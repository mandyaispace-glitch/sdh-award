const fs = require('fs');
let md = fs.readFileSync('podcast_evaluation_workflow.md', 'utf8');

const changelog = `
<div style="background-color: #f8f9fa; border-left: 4px solid #007bff; padding: 15px; margin-bottom: 20px;">
  <h3 style="margin-top: 0;">📅 系統更新日誌 (Changelog)</h3>
  <ul>
    <li><b>2026/07/31</b>：
      <ul>
        <li><b>評分公平性修復</b>：為確保比賽公信力，已補齊 曼蒂歐逆 等漏缺之 32 筆單集音檔，並透過 AI 評選引擎重新跑完全量打分。</li>
        <li><b>評選演算法升級 (Tie-breaker)</b>：導入「多維度同分參酌演算法」。當多個節目同分時，系統會先計算三集的<b>「品質穩定度 (Standard Deviation)」</b>，越穩定者名次越高；若仍同分，則微幅加權 <b>Apple Podcasts 平均星等與評論數</b> 作為終極聽眾共鳴裁決。</li>
        <li><b>報表升級</b>：在 Excel 最終匯出報表中，新增了「評選定義與細則」分頁，方便人類評審隨時參閱 AI 評分標準。</li>
      </ul>
    </li>
    <li><b>2026/07/30</b>：修正「最佳默契獎」名單資格，完全剃除單人主持不適用之節目，並強制精準輸出合格排名，解決了榜單充數問題。</li>
  </ul>
</div>
`;

if (!md.includes('系統更新日誌')) {
    // Insert after the first heading
    md = md.replace(/# 🎙️ Meta\.AI 輔助決策：鬧鐘獎 Podcast 聲量評選建議/, '# 🎙️ Meta.AI 輔助決策：鬧鐘獎 Podcast 聲量評選建議\n' + changelog);
    fs.writeFileSync('podcast_evaluation_workflow.md', md, 'utf8');
    console.log("Changelog added to podcast_evaluation_workflow.md.");
} else {
    console.log("Changelog already exists. You may want to update it if needed.");
}

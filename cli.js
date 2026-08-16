const readline = require('readline');
const { spawn } = require('child_process');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("==========================================");
console.log("🏆 天下第一 Podcaster 大會 (SDH Award) 控制台");
console.log("==========================================");
console.log("請選擇您要執行的任務：");
console.log("[1] 🔄 重新生成最新版網頁儀表板 (podcast_evaluation_workflow.html)");
console.log("[2] 📊 重新匯出評審用 Excel 報表 (Awards_Top10_Results_Tabs.xlsx)");
console.log("[3] 🚀 執行 AI 評分管線 (poc_run.js)");
console.log("[0] ❌ 離開");
console.log("==========================================");

function runScript(scriptName) {
    console.log(`\n⏳ 正在執行 ${scriptName}...\n`);
    const proc = spawn('node', [scriptName], { stdio: 'inherit', shell: true });
    proc.on('close', (code) => {
        console.log(`\n✅ ${scriptName} 執行完畢 (代碼: ${code})\n`);
        prompt();
    });
}

function prompt() {
    rl.question('👉 請輸入選項 (0-3): ', (answer) => {
        switch (answer.trim()) {
            case '1':
                runScript('generate_html.js');
                break;
            case '2':
                runScript('export_to_excel.js');
                break;
            case '3':
                runScript('poc_run.js');
                break;
            case '0':
                console.log('👋 系統關閉，再見！');
                rl.close();
                process.exit(0);
                break;
            default:
                console.log('⚠️ 無效的選項，請重新輸入。');
                prompt();
                break;
        }
    });
}

prompt();

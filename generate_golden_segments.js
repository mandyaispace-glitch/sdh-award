const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper for HTTP POST requests
function postRequest(url, headers, body) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: headers
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve({ statusCode: res.statusCode, body: data }); });
        });
        req.on('error', (err) => { reject(err); });
        if (body) {
            req.write(body);
        }
        req.end();
    });
}

async function getGoldenSegments(partnerName, title, transcriptText, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
    const headers = { 'Content-Type': 'application/json' };

    const prompt = `
你是一位專業的 Podcast 評審教練和大賽專家。以下是《${partnerName}》節目的單集《${title}》的逐字稿（前 12 分鐘 + 最後 3 分鐘）。
請幫我分析這段逐字稿，精確定位出 **3 段最建議評審聽的 3 分鐘黃金試聽片段**。請符合以下規則：
1. 第一個片段：著重於「開場引導與核心痛點切入」，必須落在前 12 分鐘內（如 00:00 - 03:00 或 01:30 - 04:30）。
2. 第二個片段：著重於「精彩論述、精妙接話或知識含金量」，必須落在前 12 分鐘內（如 05:00 - 08:00 或 08:30 - 11:30）。
3. 第三個片段：著重於「結尾總結或行動呼籲 (CTA)」，必須落在最後 3 分鐘內（請注意逐字稿中是否有標記 [最後3分鐘片段開始...]，並依據其後的內容定位，如 32:00 - 35:00 等實際時間軸）。

請務必以繁體中文且標準的 JSON 格式輸出（不要包含 markdown code block 標籤，僅輸出純 JSON 字串）：
[
  {
    "time_range": "01:23 - 04:23",
    "title": "段落名稱 (例如：精準開場與聽眾痛點)",
    "reason": "說明為什麼建議聽這一段，結合了什麼內容，以及對評估何種大會指標（如內容架構、男/女播音、默契或推坑力）有幫助。"
  },
  {
    "time_range": "08:15 - 11:15",
    "title": "段落名稱 (例如：精彩的來賓做球與默契接話)",
    "reason": "說明..."
  },
  {
    "time_range": "32:04 - 35:04",
    "title": "段落名稱 (例如：結尾行動呼籲與社群引導)",
    "reason": "說明..."
  }
]

以下為逐字稿內容：
${transcriptText}
`;

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.0
        }
    };

    const res = await postRequest(url, headers, JSON.stringify(body));
    if (res.statusCode !== 200) {
        throw new Error(`獲取黃金片段失敗，狀態碼: ${res.statusCode}, 內容: ${res.body}`);
    }

    const resJson = JSON.parse(res.body);
    const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error("回傳黃金片段為空");
    }
    return JSON.parse(text.trim());
}

async function main() {
    console.log("=================== 開始提取單集黃金 3 片段 ===================");
    
    // 1. Check API Key
    let apiKey = process.env.GEMINI_API_KEY;
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/GEMINI_API_KEY\s*=\s*(.*)/);
        if (match) apiKey = match[1].trim();
    }
    
    if (!apiKey) {
        console.error("❌ 找不到 GEMINI_API_KEY。請在 .env 檔案中配置。");
        return;
    }

    // 2. Load Selected Episodes
    const selectionPath = path.join(__dirname, 'selected_episodes_for_poc.json');
    if (!fs.existsSync(selectionPath)) {
        console.error("❌ 找不到 selected_episodes_for_poc.json。");
        return;
    }
    const selectedEpisodes = JSON.parse(fs.readFileSync(selectionPath, 'utf-8'));
    const transcriptDir = path.join(__dirname, 'poc_transcripts');

    // 3. Loop and Extract
    for (let i = 0; i < selectedEpisodes.length; i++) {
        const ep = selectedEpisodes[i];
        console.log(`\n[${i + 1}/${selectedEpisodes.length}] 正在為 《${ep.podcastName}》 - ${ep.title.substring(0, 15)}... 提取片段`);

        const sanitizedTitle = ep.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 20);
        const transcriptFilePath = path.join(transcriptDir, `${ep.partnerName.replace(/\//g, '_')}_${sanitizedTitle}_transcript.txt`);

        if (ep.recommended_segments && ep.recommended_segments.length > 0) {
            console.log(` -> 已有黃金片段快取，跳過...`);
            continue;
        }

        if (!fs.existsSync(transcriptFilePath)) {
            console.warn(` ⚠️ 找不到逐字稿檔案: ${transcriptFilePath}，跳過...`);
            continue;
        }

        const transcriptText = fs.readFileSync(transcriptFilePath, 'utf-8');

        try {
            const segments = await getGoldenSegments(ep.partnerName, ep.title, transcriptText, apiKey);
            ep.recommended_segments = segments;
            console.log(` -> 成功提取 3 段黃金時間軸！`);
        } catch (err) {
            console.error(` ❌ 提取出錯: ${err.message}`);
        }

        // Wait 1 second to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // 4. Save back to selected_episodes_for_poc.json
    fs.writeFileSync(selectionPath, JSON.stringify(selectedEpisodes, null, 2), 'utf-8');
    console.log(`\n🎉 所有黃金試聽片段已成功附加並存檔至: ${selectionPath}`);
}

main();

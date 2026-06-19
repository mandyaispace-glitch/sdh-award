const fs = require('fs');
const path = require('path');
const https = require('https');
const XLSX = require('xlsx');

// Helper to fetch/download binary file
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // Redirect
                return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(destPath, () => {});
                return reject(new Error(`下載失敗，狀態碼: ${response.statusCode}`));
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            file.close();
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

// Download helper with retry logic
function downloadFileWithRetry(url, destPath, retries = 3) {
    return downloadFile(url, destPath).catch((err) => {
        if (retries > 1) {
            console.warn(` ⚠️ 下載失敗 (${err.message})，正在重試...剩餘重試次數: ${retries - 1}`);
            return new Promise(resolve => setTimeout(resolve, 5000))
                .then(() => downloadFileWithRetry(url, destPath, retries - 1));
        }
        throw err;
    });
}

// Helper for HTTP POST requests with timeout
function postRequest(url, headers, body, timeoutMs = 360000) { // 6 minutes default
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: headers,
            timeout: timeoutMs
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve({ statusCode: res.statusCode, body: data }); });
        });
        req.on('error', (err) => { reject(err); });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`請求超時 (${timeoutMs}ms)`));
        });
        if (body) {
            req.write(typeof body === 'string' ? body : body);
        }
        req.end();
    });
}

// Helper to delete files from Gemini Files API
async function deleteGeminiFile(fileUri, apiKey) {
    const fileId = fileUri.split('/').pop();
    const url = `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${apiKey}`;
    return new Promise((resolve) => {
        const urlObj = new URL(url);
        const req = https.request({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'DELETE'
        }, (res) => {
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.end();
    });
}

async function uploadAudioToGemini(filePath, apiKey) {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;
    
    // Step 1: Initiate Resumable Upload
    const initUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
    const initHeaders = {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': fileSize.toString(),
        'X-Goog-Upload-Header-Content-Type': 'audio/mp3',
        'Content-Type': 'application/json'
    };
    
    const initBody = JSON.stringify({
        file: { displayName: path.basename(filePath) }
    });
    
    const initRes = await new Promise((resolve, reject) => {
        const urlObj = new URL(initUrl);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: initHeaders
        };
        const req = https.request(options, (res) => {
            resolve({
                statusCode: res.statusCode,
                uploadUrl: res.headers['x-goog-upload-url'],
                headers: res.headers
            });
        });
        req.on('error', reject);
        req.write(initBody);
        req.end();
    });
    
    if (!initRes.uploadUrl) {
        throw new Error(`初始化上傳失敗，狀態碼: ${initRes.statusCode}`);
    }
    
    const uploadUrl = initRes.uploadUrl;
    
    // Step 2: Upload the actual file data
    const fileBuffer = fs.readFileSync(filePath);
    const uploadHeaders = {
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
        'Content-Length': fileSize.toString()
    };
    
    const uploadRes = await postRequest(uploadUrl, uploadHeaders, fileBuffer);
    if (uploadRes.statusCode !== 200) {
        throw new Error(`上傳音訊失敗，狀態碼: ${uploadRes.statusCode}, 回傳: ${uploadRes.body}`);
    }
    
    const uploadData = JSON.parse(uploadRes.body);
    return uploadData.file.uri;
}

async function getFileState(fileUri, apiKey) {
    const fileId = fileUri.split('/').pop();
    const url = `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${apiKey}`;
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        https.get({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET'
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`無法獲取檔案狀態，狀態碼: ${res.statusCode}, 內容: ${data}`));
                } else {
                    resolve(JSON.parse(data));
                }
            });
        }).on('error', reject);
    });
}

async function waitForFileActive(fileUri, apiKey) {
    console.log(" -> 正在等待 Gemini 處理音訊檔案 (可能需要十到數十秒)...");
    let retries = 30;
    while (retries > 0) {
        const fileInfo = await getFileState(fileUri, apiKey);
        const state = fileInfo.state;
        if (state === 'ACTIVE') {
            console.log(" -> 檔案處理完成，狀態已轉為 ACTIVE！");
            return;
        } else if (state === 'FAILED') {
            throw new Error("Gemini 處理音訊檔案失敗。");
        }
        console.log(` -> 檔案仍在處理中 (狀態: ${state})，等待 5 秒後重試...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        retries--;
    }
    throw new Error("等待檔案 ACTIVE 超時。");
}

async function transcribeAudio(fileUri, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const headers = { 'Content-Type': 'application/json' };
    
    const prompt = `
你是一位專業的速記員。請幫我精確轉寫這段音檔的「前 12 分鐘」與「最後 3 分鐘」的逐字稿。
請務必符合以下規則：
1. 標註時間軸與說話者，例如：
   [01:23] 主持人A：各位聽眾大家好...
   [02:15] 來賓B：謝謝主持人...
2. 若中間有省略，請加上 [中間省略...] 的標記。
3. 確保字句精確，避免漏字，尤其是主持人的話語。
4. 在最後 3 分鐘片段開始前，請清晰標記 [最後3分鐘片段開始...]。
5. 僅輸出轉寫的逐字稿文字，不要包含 any 前言或後記。
`;

    const body = {
        contents: [
            {
                parts: [
                    { fileData: { fileUri: fileUri, mimeType: "audio/mp3" } },
                    { text: prompt }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.0
        }
    };
    
    const res = await postRequest(url, headers, JSON.stringify(body));
    if (res.statusCode !== 200) {
        throw new Error(`轉寫失敗，狀態碼: ${res.statusCode}, 回傳: ${res.body}`);
    }
    
    const resJson = JSON.parse(res.body);
    const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error("轉寫回傳內容為空");
    }
    return text;
}

// Helper to transcribe with retry
async function transcribeAudioWithRetry(fileUri, apiKey, retries = 3) {
    try {
        return await transcribeAudio(fileUri, apiKey);
    } catch (err) {
        if (retries > 1) {
            console.warn(` ⚠️ 轉寫失敗 (${err.message})，正在重試...剩餘重試次數: ${retries - 1}`);
            await new Promise(resolve => setTimeout(resolve, 10000)); // wait 10s
            return transcribeAudioWithRetry(fileUri, apiKey, retries - 1);
        }
        throw err;
    }
}

// Perform Horizontal PK Evaluation on all transcripts
async function evaluateTranscriptsHorizontal(transcriptsData, awardDefinitions, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const headers = { 'Content-Type': 'application/json' };
    
    // Group transcripts by partner
    const grouped = {};
    transcriptsData.forEach(t => {
        if (!grouped[t.partnerName]) {
            grouped[t.partnerName] = {
                partnerName: t.partnerName,
                podcastName: t.podcastName,
                episodes: []
            };
        }
        grouped[t.partnerName].episodes.push({
            title: t.episodeTitle,
            transcript: t.transcript
        });
    });

    let combinedTranscriptsText = "";
    let showIndex = 1;
    for (const partnerName in grouped) {
        const show = grouped[partnerName];
        combinedTranscriptsText += `\n=============================================================\n`;
        combinedTranscriptsText += `候選節目 #${showIndex}:\n`;
        combinedTranscriptsText += `- 合作夥伴: ${show.partnerName}\n`;
        combinedTranscriptsText += `- 節目名稱: ${show.podcastName}\n`;
        combinedTranscriptsText += `【隨機抽樣的 3 個單集與逐字稿】:\n`;
        show.episodes.forEach((ep, epIdx) => {
            combinedTranscriptsText += `\n--- 單集 ${epIdx + 1}: ${ep.title} ---\n`;
            combinedTranscriptsText += `${ep.transcript}\n`;
        });
        combinedTranscriptsText += `=============================================================\n`;
        showIndex++;
    }

    const prompt = `
你是一位專業的 Podcast 評審與大賽決審專家。以下是本次大賽的【鬧鐘獎 - 評選定義與指標】：
${awardDefinitions}

請針對以下這三檔候選節目的隨機抽樣單集逐字稿（每檔節目各有 3 個單集，每集包含開頭 12 分鐘與結尾 3 分鐘），進行「橫向對比 PK 評估與合規審查」：
${combinedTranscriptsText}

【任務要求】：
請對照評選指標，針對以下 10 個與文本/口條相關的獎項，在三檔候選節目中進行橫向對比：
1. 最佳內容架構獎 (content_structure)
2. 最佳默契獎 (best_duo_hosts) (注意：若是單人主持節目，請在該節目的評分填 null，並在 PK 排名中予以說明)
3. 最神單元企劃獎 (episode_planning)
4. 最佳男播音員獎 (best_male_host) (注意：若主持人全為女性，請在該節目的評分填 null)
5. 最佳女播音員獎 (best_female_host) (注意：若主持人全為男性，請在該節目的評分填 null)
6. 聽完馬上獎（極致推坑王） (best_cta)
7. 只有你在獎（稀有藍海守護者） (niche_market)
8. 自我探索獎 (self_exploration)
9. 講不完大獎 / 泡麵沒熟獎 (時長精煉度) (duration_efficiency)
10. 醒醒再獎 / 年度療癒獎 / 深夜輕輕獎 (第一輪意向) (atmosphere)

為每個獎項排出第一名（金獎）、第二名（銀獎）與第三名（銅獎）。打分範圍為 1.0 至 10.0 分（最小級距 0.5 分），並給出詳細的「評分說明」以及「是否對應符合我們的定義要求」（compliance，填「符合」或「不符合(原因)」）。

請務必以繁體中文且標準的 JSON 格式輸出（不得包含 markdown code block 標籤，僅輸出純 JSON 字串）：
{
  "awards": {
    "content_structure": {
      "award_name": "最佳內容架構獎",
      "ranking": [
        { "rank": 1, "partnerName": "郝旭烈/郝聲音", "score": 9.0, "reason": "說明針對 3 個單集的綜合打分理由...", "compliance": "符合" },
        { "rank": 2, "partnerName": "五吉郎", "score": 8.5, "reason": "說明針對 3 個單集的綜合打分理由...", "compliance": "符合" },
        { "rank": 3, "partnerName": "哇賽心理學_蔡宇哲", "score": 8.0, "reason": "說明打分理由與是否合規...", "compliance": "不符合(原因：抽樣單集均無明確的開場引導與結尾)" }
      ],
      "comparative_analysis": "針對三方在此獎項的表現進行橫向對比分析，點出高下差距的原因。"
    },
    "best_duo_hosts": {
      "award_name": "最佳默契獎",
      "ranking": [
        { "rank": 1, "partnerName": "哇賽心理學_蔡宇哲", "score": 9.5, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 2, "partnerName": "五吉郎", "score": 9.0, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 3, "partnerName": "郝旭烈/郝聲音", "score": 7.5, "reason": "說明理由...", "compliance": "符合" }
      ],
      "comparative_analysis": "..."
    },
    "episode_planning": {
      "award_name": "最神單元企劃獎",
      "ranking": [
        { "rank": 1, "partnerName": "哇賽心理學_蔡宇哲", "score": 9.5, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 2, "partnerName": "五吉郎", "score": 9.0, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 3, "partnerName": "郝旭烈/郝聲音", "score": 8.0, "reason": "說明理由...", "compliance": "符合" }
      ],
      "comparative_analysis": "..."
    },
    "best_male_host": {
      "award_name": "最佳男播音員獎",
      "ranking": [
        { "rank": 1, "partnerName": "五吉郎", "score": 9.0, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 2, "partnerName": "郝旭烈/郝聲音", "score": 8.5, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 3, "partnerName": "哇賽心理學_蔡宇哲", "score": 8.0, "reason": "說明理由...", "compliance": "符合" }
      ],
      "comparative_analysis": "..."
    },
    "best_female_host": {
      "award_name": "最佳女播音員獎",
      "ranking": [
        { "rank": 1, "partnerName": "哇賽心理學_蔡宇哲", "score": 9.0, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 2, "partnerName": "郝旭烈/郝聲音", "score": null, "reason": "節目無女主持人", "compliance": "不適用" },
        { "rank": 3, "partnerName": "五吉郎", "score": null, "reason": "節目無女主持人", "compliance": "不適用" }
      ],
      "comparative_analysis": "..."
    },
    "best_cta": {
      "award_name": "聽完馬上獎（極致推坑王）",
      "ranking": [
        { "rank": 1, "partnerName": "五吉郎", "score": 9.5, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 2, "partnerName": "哇賽心理學_蔡宇哲", "score": 8.0, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 3, "partnerName": "郝旭烈/郝聲音", "score": 6.5, "reason": "說明理由...", "compliance": "不符合(原因：單集結尾均缺少呼籲訂閱與社群互動行動)" }
      ],
      "comparative_analysis": "..."
    },
    "niche_market": {
      "award_name": "只有你在獎（稀有藍海守護者）",
      "ranking": [
        { "rank": 1, "partnerName": "哇賽心理學_蔡宇哲", "score": 9.5, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 2, "partnerName": "五吉郎", "score": 7.5, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 3, "partnerName": "郝旭烈/郝聲音", "score": 7.0, "reason": "說明理由...", "compliance": "符合" }
      ],
      "comparative_analysis": "..."
    },
    "self_exploration": {
      "award_name": "自我探索獎",
      "ranking": [
        { "rank": 1, "partnerName": "五吉郎", "score": 9.5, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 2, "partnerName": "哇賽心理學_蔡宇哲", "score": 9.0, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 3, "partnerName": "郝旭烈/郝聲音", "score": 8.0, "reason": "說明理由...", "compliance": "符合" }
      ],
      "comparative_analysis": "..."
    },
    "duration_efficiency": {
      "award_name": "講不完大獎 / 泡麵沒熟獎 (時長精煉度)",
      "ranking": [
        { "rank": 1, "partnerName": "郝旭烈/郝聲音", "score": 9.0, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 2, "partnerName": "五吉郎", "score": 4.0, "reason": "說明理由...", "compliance": "不符合(原因：時長既未超過 60 分鐘也未在 15 分鐘內)" },
        { "rank": 3, "partnerName": "哇賽心理學_蔡宇哲", "score": 4.0, "reason": "說明理由...", "compliance": "不符合(原因：時長不符合該時長獎項之門檻)" }
      ],
      "comparative_analysis": "..."
    },
    "atmosphere": {
      "award_name": "醒醒再獎 / 年度療癒獎 / 深夜輕輕獎 (意向)",
      "ranking": [
        { "rank": 1, "partnerName": "五吉郎", "score": 9.5, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 2, "partnerName": "郝旭烈/郝聲音", "score": 8.5, "reason": "說明理由...", "compliance": "符合" },
        { "rank": 3, "partnerName": "哇賽心理學_蔡宇哲", "score": 7.0, "reason": "說明理由...", "compliance": "符合" }
      ],
      "comparative_analysis": "..."
    }
  },
  "overall_summary": "對這三檔節目進行綜合橫向對比分析，總結每檔節目的核心定位與主持風格差異。"
}
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
        throw new Error(`評估失敗，狀態碼: ${res.statusCode}, 回傳: ${res.body}`);
    }
    
    const resJson = JSON.parse(res.body);
    const text = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error("評估結果為空");
    }
    return JSON.parse(text.trim());
}

async function main() {
    console.log("=================== SDH Award AI 評選模擬 (POC - 橫向 PK 版) ===================");
    
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
    
    // 2. Read Award Definitions
    const awardDefPath = path.join(__dirname, 'award_definitions.md');
    if (!fs.existsSync(awardDefPath)) {
        console.error("❌ 找不到 award_definitions.md。");
        return;
    }
    const awardDefinitions = fs.readFileSync(awardDefPath, 'utf-8');
    
    // 3. Read Excel to get MP3 URLs
    const excelPath = path.join(__dirname, 'eligible_episodes_pool.xlsx');
    if (!fs.existsSync(excelPath)) {
        console.error("❌ 找不到 eligible_episodes_pool.xlsx，請先運行 build_episode_pool.js。");
        return;
    }
    
    console.log("正在讀取 Excel 單集池...");
    const workbook = XLSX.readFile(excelPath);
    const ws = workbook.Sheets["合格單集池"];
    if (!ws) {
        console.error("❌ 找不到「合格單集池」工作表。");
        return;
    }
    
    const allEpisodes = XLSX.utils.sheet_to_json(ws);
    
    // Target partners for POC
    const targetPartners = ["郝旭烈/郝聲音", "五吉郎", "哇賽心理學_蔡宇哲"];
    const selectionPath = path.join(__dirname, 'selected_episodes_for_poc.json');
    let selectedEpisodes = [];
    
    if (fs.existsSync(selectionPath)) {
        console.log(` -> 讀取已存在的隨機抽樣清單快取: ${selectionPath}`);
        try {
            selectedEpisodes = JSON.parse(fs.readFileSync(selectionPath, 'utf-8'));
        } catch (e) {
            console.error(" ⚠️ 讀取抽樣清單快取失敗，將重新抽樣: ", e.message);
        }
    }
    
    if (selectedEpisodes.length === 0) {
        console.log(" -> 尚未有抽樣快取，正在為每檔節目隨機抽取 3 個單集...");
        targetPartners.forEach(partner => {
            const partnerEps = allEpisodes.filter(row => row["合作夥伴"] === partner);
            if (partnerEps.length === 0) {
                console.warn(` ⚠️ 找不到合作夥伴 ${partner} 的單集。`);
                return;
            }
            // Shuffle
            const shuffled = [...partnerEps].sort(() => 0.5 - Math.random());
            // Take 3
            const selected = shuffled.slice(0, 3);
            selected.forEach(ep => {
                selectedEpisodes.push({
                    partnerName: ep["合作夥伴"],
                    podcastName: ep["節目名稱"],
                    title: ep["單集標題"],
                    mp3Url: ep["音檔連結(MP3)"]
                });
            });
        });
        
        fs.writeFileSync(selectionPath, JSON.stringify(selectedEpisodes, null, 2), 'utf-8');
        console.log(`🎉 隨機抽樣完成！清單已存檔至: ${selectionPath}`);
    }
    
    if (selectedEpisodes.length === 0) {
        console.error("❌ 未能篩選出 any 待測試節目。");
        return;
    }
    
    // Create output directories
    const transcriptDir = path.join(__dirname, 'poc_transcripts');
    if (!fs.existsSync(transcriptDir)) {
        fs.mkdirSync(transcriptDir);
    }
    const tempDir = path.join(__dirname, 'poc_temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    const transcriptsData = [];
    
    for (let i = 0; i < selectedEpisodes.length; i++) {
        const ep = selectedEpisodes[i];
        console.log(`\n-------------------------------------------------------------`);
        console.log(`[${i + 1}/${selectedEpisodes.length}] 正在獲取逐字稿: ${ep.partnerName} - 《${ep.podcastName}》`);
        
        const sanitizedTitle = ep.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').substring(0, 20);
        const tempMp3Path = path.join(tempDir, `${ep.partnerName.replace(/\//g, '_')}_${sanitizedTitle}_temp.mp3`);
        const transcriptFilePath = path.join(transcriptDir, `${ep.partnerName.replace(/\//g, '_')}_${sanitizedTitle}_transcript.txt`);
        
        let transcriptText = "";
        
        // Local Cache Check
        if (fs.existsSync(transcriptFilePath)) {
            console.log(` -> 偵測到已存在的逐字稿快取，直接讀取: ${transcriptFilePath}`);
            transcriptText = fs.readFileSync(transcriptFilePath, 'utf-8');
            transcriptsData.push({
                partnerName: ep.partnerName,
                podcastName: ep.podcastName,
                episodeTitle: ep.title,
                transcript: transcriptText
            });
        } else {
            console.log(` -> 正在下載測試音檔 (支援斷線重試，大小約 15~75MB)...`);
            try {
                await downloadFileWithRetry(ep.mp3Url, tempMp3Path, 3);
                console.log(` -> 下載成功: ${tempMp3Path} (${Math.round(fs.statSync(tempMp3Path).size / 1024 / 1024 * 100) / 100} MB)`);
                
                console.log(` -> 正在上傳音檔至 Gemini Files API...`);
                const fileUri = await uploadAudioToGemini(tempMp3Path, apiKey);
                console.log(` -> 上傳成功！File URI: ${fileUri}`);
                
                await waitForFileActive(fileUri, apiKey);
                
                console.log(` -> 正在使用 Gemini 2.5 Flash 轉寫前 12 分鐘 + 最後 3 分鐘逐字稿 (預計需時 1~2 分鐘)...`);
                transcriptText = await transcribeAudioWithRetry(fileUri, apiKey, 3);
                
                // Save locally
                fs.writeFileSync(transcriptFilePath, transcriptText, 'utf-8');
                console.log(` -> 逐字稿生成成功並存檔: ${transcriptFilePath}`);
                
                transcriptsData.push({
                    partnerName: ep.partnerName,
                    podcastName: ep.podcastName,
                    episodeTitle: ep.title,
                    transcript: transcriptText
                });
                
                // Cleanup cloud file
                await deleteGeminiFile(fileUri, apiKey);
                
            } catch (err) {
                console.error(` ❌ 處理音檔出錯: ${err.message}`);
            } finally {
                if (fs.existsSync(tempMp3Path)) {
                    fs.unlinkSync(tempMp3Path);
                }
            }
        }
    }
    
    // Cleanup local temp dir
    if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
    }
    
    if (transcriptsData.length === 0) {
        console.error("\n❌ 沒有任何成功轉寫的逐字稿，無法進行 PK 評估。");
        return;
    }
    
    console.log(`\n-------------------------------------------------------------`);
    console.log(`🎉 逐字稿補齊完成！共有 ${transcriptsData.length} 檔節目進入橫向決審 PK 階段。`);
    console.log(` -> 正在呼叫 Gemini 2.5 Flash 進行橫向對比 PK 評估 (一次吃三者逐字稿)...`);
    
    try {
        const pkResults = await evaluateTranscriptsHorizontal(transcriptsData, awardDefinitions, apiKey);
        console.log(` -> 橫向 PK 評估打分完成！`);
        
        // Enforce scoring business rules:
        // 1. Duo Hosts Award: Only duo hosts can be scored. Single host shows must be null/not applicable.
        if (pkResults.awards.best_duo_hosts) {
            pkResults.awards.best_duo_hosts.ranking.forEach(r => {
                if (r.partnerName === "郝旭烈/郝聲音" || r.partnerName === "五吉郎") {
                    r.score = null;
                    r.compliance = "不適用";
                    r.reason = "單人主持節目，不適用此獎項。";
                }
            });
        }
        // 2. Best Female Host Award: Only female hosts can be scored. Male-only shows must be null/not applicable.
        if (pkResults.awards.best_female_host) {
            pkResults.awards.best_female_host.ranking.forEach(r => {
                if (r.partnerName === "郝旭烈/郝聲音" || r.partnerName === "五吉郎") {
                    r.score = null;
                    r.compliance = "不適用";
                    r.reason = "節目無女主持人，不適用此獎項。";
                }
            });
        }
        
        // Write JSON results
        const resultsJsonPath = path.join(__dirname, 'poc_results.json');
        fs.writeFileSync(resultsJsonPath, JSON.stringify(pkResults, null, 2), 'utf-8');
        console.log(`🎉 評分 JSON 結果已存檔: ${resultsJsonPath}`);
        
        // Generate MD PK Report
        console.log("正在編譯決審 PK 模擬報告 (poc_report.md)...");
        let reportMd = `# 🏆 2026「鬧鐘獎」決審 PK 模擬 (POC) 報告\n\n`;
        reportMd += `本報告採用 **「多文件橫向相對 PK 機制」**，針對三檔節目**各隨機抽樣 3 個單集**的逐字稿進行綜合對比評審，並包含大賽標準的合規審查。\n\n`;
        reportMd += `*   **評審引擎**：Gemini 3.5 Flash (大上下文橫向 PK 模式)\n`;
        reportMd += `*   **評審指標定義**：[award_definitions.md](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/award_definitions.md)\n`;
        reportMd += `*   **各節目抽樣評估之單集清單**：\n`;
        
        targetPartners.forEach(partner => {
            const partnerEps = selectedEpisodes.filter(e => e.partnerName === partner);
            reportMd += `    *   **【${partner}】**《${partnerEps[0]?.podcastName || ""}》：\n`;
            partnerEps.forEach((ep, idx) => {
                reportMd += `        ${idx + 1}. *${ep.title}*\n`;
            });
        });
        
        reportMd += `\n## 📊 決審 PK 排行總表\n\n`;
        reportMd += `| 鬧鐘大會獎項 | 🥇 金獎 (第一名) | 🥈 銀獎 (第二名) | 🥉 銅獎 (第三名) |\n`;
        reportMd += `| :--- | :--- | :--- | :--- |\n`;
        
        const awardsKeys = Object.keys(pkResults.awards);
        awardsKeys.forEach(key => {
            const aw = pkResults.awards[key];
            const getDisplay = (rankNum) => {
                const item = aw.ranking.find(r => r.rank === rankNum);
                if (!item) return "N/A";
                const scoreText = item.score !== null ? `(${item.score}分)` : "(N/A)";
                return `**${item.partnerName}** <br> ${scoreText}`;
            };
            reportMd += `| **${aw.award_name}** | ${getDisplay(1)} | ${getDisplay(2)} | ${getDisplay(3)} |\n`;
        });
        
        reportMd += `\n\n## 📝 各獎項橫向對比明細\n\n`;
        
        awardsKeys.forEach(key => {
            const aw = pkResults.awards[key];
            reportMd += `### 🏅 ${aw.award_name}\n\n`;
            reportMd += `> **🔍 橫向 PK 對比分析**：\n> ${aw.comparative_analysis}\n\n`;
            reportMd += `**名次打分明細**：\n`;
            aw.ranking.forEach(r => {
                const scoreText = r.score !== null ? `**${r.score} 分**` : "**N/A** (不適用)";
                const complianceText = r.compliance ? ` (定義判定：**${r.compliance}**)` : "";
                reportMd += `*   **第 ${r.rank} 名 (${r.rank === 1 ? '金' : r.rank === 2 ? '銀' : '銅'})**：${r.partnerName} — ${scoreText}${complianceText}\n`;
                reportMd += `    *   *評審打分理由*：${r.reason}\n`;
            });
            reportMd += `\n---\n\n`;
        });
        
        reportMd += `\n## 🔮 評審團綜合決審總評\n\n`;
        reportMd += `> ${pkResults.overall_summary}\n`;
        
        const reportPath = path.join(__dirname, 'poc_report.md');
        fs.writeFileSync(reportPath, reportMd, 'utf-8');
        console.log(`🎉 POC 橫向 PK 報告編譯完成，已寫入: ${reportPath}`);
        
        // 4. Write to Excel Sheet "POC評分結果"
        console.log("正在寫入 Excel 評分表分頁 (POC評分結果)...");
        const workbookWrite = XLSX.readFile(excelPath);
        
        // Remove existing "POC評分結果" sheet if it exists
        if (workbookWrite.Sheets["POC評分結果"]) {
            delete workbookWrite.Sheets["POC評分結果"];
            const idx = workbookWrite.SheetNames.indexOf("POC評分結果");
            if (idx > -1) {
                workbookWrite.SheetNames.splice(idx, 1);
            }
        }
        
        // Prepare rows for Excel
        const excelRows = [];
        
        targetPartners.forEach(partner => {
            const partnerEps = selectedEpisodes.filter(e => e.partnerName === partner);
            const rowData = {
                "合作夥伴": partner,
                "節目名稱": partnerEps[0]?.podcastName || "",
                "抽樣單集 1": partnerEps[0]?.title || "",
                "抽樣單集 2": partnerEps[1]?.title || "",
                "抽樣單集 3": partnerEps[2]?.title || ""
            };
            
            // For each award, find the score, reason, and compliance
            awardsKeys.forEach(key => {
                const aw = pkResults.awards[key];
                const rankItem = aw.ranking.find(r => r.partnerName === partner);
                rowData[`${aw.award_name}_得分`] = rankItem ? (rankItem.score !== null ? rankItem.score : "N/A") : "N/A";
                rowData[`${aw.award_name}_評語`] = rankItem ? rankItem.reason : "N/A";
                rowData[`${aw.award_name}_是否合規`] = rankItem ? rankItem.compliance : "N/A";
            });
            
            excelRows.push(rowData);
        });
        
        const wsNew = XLSX.utils.json_to_sheet(excelRows);
        XLSX.utils.book_append_sheet(workbookWrite, wsNew, "POC評分結果");
        XLSX.writeFile(workbookWrite, excelPath);
        console.log(`🎉 Excel 評分表分頁已成功寫入至: ${excelPath}`);
        
    } catch (e) {
        console.error("❌ 橫向評估出錯:", e.message);
    }
}

main();

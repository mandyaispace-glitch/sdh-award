const fs = require('fs');
const path = require('path');
const https = require('https');
const XLSX = require('xlsx');

// 1. Helper to fetch/download binary file
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // Redirect
                file.close(() => {
                    fs.unlink(destPath, () => {});
                    downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
                });
                return;
            }
            if (response.statusCode !== 200) {
                file.close(() => {
                    fs.unlink(destPath, () => {});
                    reject(new Error(`下載失敗，狀態碼: ${response.statusCode}`));
                });
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    resolve();
                });
            });
        }).on('error', (err) => {
            file.close(() => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        });
    });
}

// 2. Download helper with retry logic
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

// 3. Helper for HTTP POST requests with timeout
function postRequest(url, headers, body, timeoutMs = 180000) { // 3 minutes timeout
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
            req.write(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

// 4. Helper to delete files from Gemini Files API
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

// 4b. Helper to list and clean all temp files from Gemini Files API
async function cleanAllGeminiFiles(apiKey) {
    console.log("🧹 正在清理 Gemini 雲端殘留檔案...");
    const url = `https://generativelanguage.googleapis.com/v1beta/files?key=${apiKey}`;
    return new Promise((resolve) => {
        const urlObj = new URL(url);
        https.get({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET'
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', async () => {
                if (res.statusCode === 200) {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.files && parsed.files.length > 0) {
                            let count = 0;
                            for (const file of parsed.files) {
                                // Match temp_audio filenames
                                if (file.displayName && (file.displayName.startsWith('temp_audio') || file.name.startsWith('files/temp_audio'))) {
                                    console.log(` -> 刪除殘留檔案: ${file.name} (${file.displayName})`);
                                    await deleteGeminiFile(file.name, apiKey);
                                    count++;
                                }
                            }
                            console.log(`🧹 清理完成，共刪除 ${count} 個殘留檔案。`);
                        } else {
                            console.log("🧹 未發現殘留檔案。");
                        }
                    } catch (e) {
                        console.error("🧹 解析檔案清單出錯:", e.message);
                    }
                } else {
                    console.error("🧹 無法獲取檔案清單，狀態碼:", res.statusCode);
                }
                resolve();
            });
        }).on('error', (err) => {
            console.error("🧹 獲取檔案清單連線出錯:", err.message);
            resolve();
        });
    });
}

// 5. Upload file to Gemini Files API
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

// 6. Get file state
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

// 7. Wait for file to become active
async function waitForFileActive(fileUri, apiKey) {
    console.log(" -> 正在等待 Gemini 雲端處理音訊檔案 (轉檔中)...");
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

// 8. Analyze audio voice features using Gemini 2.5 Flash
async function queryVoiceAnalysisRaw(fileUri, apiKey) {
    console.log(" -> 正在呼叫 Gemini 2.5 Flash 進行聲音特徵診斷與物理分析...");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const headers = { 'Content-Type': 'application/json' };
    
    const prompt = `
你是一位專業的金鐘獎廣播與 Podcast 聲音與節目評審。請聆聽並評估這檔節目完整單集的說話物理特徵與錄音品質，並針對下列各點進行深度打分與回覆：

1. 語速 (Speech Rate)：估算主講人說話的平均語速（每分鐘約多少字，例如 195 字/分）。
2. 贅字分析 (Filler Words)：評定贅字頻率等級（低、中、高），並具體說明常出現的口頭禪或贅字（如「呃」、「然後」、「就是」、「那」的出現頻率與習慣）。
3. 聲音共鳴特質 (Vocal Resonance)：評定主講人聲音的親和力與共鳴感。特別針對男主持人檢測「中低音共鳴與厚實度」；女主持人檢測「高音域圓潤度與溫馨陪伴感」，並說明是否刺耳。
4. 錄音品質等級 (Acoustic Quality Level)：判定錄音品質（優、中、差），並檢測是否有以下物理缺陷：
   - 噴麥 (popping)
   - 突兀爆音 (clipping)
   - 背景雜音或環境噪音 (noise/hiss)
5. 推薦黃金片段 (Recommended Listen Segments)：請在整集音檔中，尋找並挑選出【3個最精彩且符合不同大賽獎項評估維度的黃金片段】。片段長度建議在 1.5 到 3 分鐘之間：
   - 【第一個片段（內容與企劃）】：挑選來賓與主持人聊出最精采的觀點、乾貨火花、或具備深度思考與利基選題的區間。用於評選【最神單元企劃】與【自我探索獎】。
   - 【第二個片段（主持控場與互動）】：專門挑選能展現「主持人主持與控場功力」的片段。例如：主持人如何精彩接話/提問？當話題歪掉時主持人如何溫柔且順暢地拉回核心？如果是雙人主持，展現了怎樣流暢且自然的默契接話或笑聲？用於評選【最佳內容架構獎】與【最佳默契獎】。
   - 【第三個片段（主持人聲線特質）】：專門挑選能展現「主持人聲音播音實力與魅力」的片段。必須是主持人發言或開場/收尾的區間，分析其發音清晰度、語速是否舒適（180-220字/分）、情緒感染力，或是否具備強烈深夜安撫陪伴感（無刺耳爆音）。用於評選【最佳男/女播音員獎】與【深夜輕輕/醒醒再獎】。
   - 請在「reason」中，除了描述內容外，【必須具體且深入地評論主持人在該片段中的主持技巧、控場表現或聲線特質】，讓人類評審能直接作為審查主持功力的依據。
6. 獎項評分 (Award Scores)：請聆聽並評估這檔節目單集，依據【2026鬧鐘獎評選定義】，針對下列 14 個獎項維度進行打分（每個維度給予 1.0 到 10.0 分，最小級距 0.5 分，若不適用填 null）。為符合評審嚴謹度，打分時【請拉開差距，不要都給相同的平均分，且避免給出極端分如 10.0 或 1.0】：
   - "content_structure": 最佳內容架構獎 (評估主持人開場鋪陳、轉折引導、拉回核心與總結架構功力)
   - "best_duo_hosts": 最佳默契獎 (評估雙主持人或主持與來賓接話流暢度、插話搶話頻率、共鳴笑聲同步率。若為單人主持且「無任何來賓/互動」的集數，此集填 null)
   - "episode_planning": 最神單元企劃獎 (評估選題新穎度、創意案例、與內容含金量深度)
   - "best_male_host": 最佳男播音員獎 (男主持人的口條流暢度、聲音清晰度、語速穩定度、中低音共鳴與渲染力。無男主持填 null)
   - "best_female_host": 最佳女播音員獎 (女主持人的口條流暢度、聲音清晰度、語速穩定度、高音域圓潤與陪伴感。無女主持填 null)
   - "best_cta": 聽完馬上獎 (評估行動呼籲 CTA 強度與聽眾實踐催化力)
   - "niche_market": 只有你在獎 (評估議題稀有度、冷門利基市場論述完整度)
   - "atmosphere_night": 深夜輕輕獎 (評估語調溫柔穩定度、陪伴治癒感、無突兀尖銳爆音)
   - "atmosphere_morning": 醒醒再獎 (評估節奏明快度、語調朝氣與通勤提神醒腦度)
   - "atmosphere_healing": 年度療癒獎 (評估談話風格輕鬆歡樂、日常廢話解壓感、笑聲自然度)
   - "self_exploration": 自我探索獎 (評估自我成長、內在探索與心靈啟發深度)
   - "best_long_form": 天亮了還在獎 (單集時長大於60分鐘的長篇內容，且資訊密度高無冷場。時長小於60分填 null 或低分)
   - "best_short_form": 到底有沒有獎 (單集時長在 10-15 分鐘的短篇內容，且精煉傳播效率高。時長大於15分填 null 或低分)
   - "please_continue": 請你繼續獎 (評估主持人對聽眾的黏著度、對談情感溫度與靈魂陪伴感)

請務必以繁體中文且標準的 JSON 格式輸出（不要輸出 markdown 標記包裝，直接輸出純 JSON 字串）：
{
  "speech_rate_wpm": 205,
  "filler_words_level": "中",
  "filler_words_analysis": "常在句首使用「然後」進行轉折，贅字頻率中等...",
  "vocal_resonance": "男聲低音厚實，共鳴感強，語調情感豐富無機器人唸稿感...",
  "acoustic_quality_level": "優",
  "acoustic_issues": {
    "popping": "無",
    "clipping": "無",
    "noise": "環境安靜，幾乎無底噪"
  },
  "acoustic_summary": "整體錄音品質優良，音量平穩，沒有突兀爆音與噴麥現象。",
  "recommended_segments": [
    {
      "time_range": "08:15 - 11:15",
      "title": "[內容與企劃] 來賓電商逆襲的核心思考",
      "reason": "來賓分享創業心法，對談觀點極深。主持人適時做球提問，極具單元企劃與啟發價值。"
    },
    {
      "time_range": "20:30 - 23:30",
      "title": "[主持控場與互動] 話題失焦時主持人的完美拉回",
      "reason": "此段來賓發言較散，主持人以幽默插科打諢將對話拉回核心主題，展現極高超的架構控場與雙人互動默契。"
    },
    {
      "time_range": "35:00 - 37:30",
      "title": "[聲線特質] 主持人溫馨關懷的收尾",
      "reason": "主持人獨自發言段落，語速降至 190 字/分，共鳴柔和真誠，無噴麥爆音，極具深夜暖心陪伴感。"
    }
  ],
  "award_scores": {
    "content_structure": { "score": 8.5, "reason": "主持人開場鋪陳完整，中途能流暢引導話題，結尾亦有精要總結。" },
    "best_duo_hosts": { "score": null, "reason": "此單集僅有單人主持，不適用默契評分。" },
    "episode_planning": { "score": 9.0, "reason": "選題新穎，結合個人IP變現，案例生動且含金量極高。" },
    "best_male_host": { "score": 8.5, "reason": "男主持人聲音厚實有共鳴，語速適中但口頭禪「就是」稍多。" },
    "best_female_host": { "score": null, "reason": "節目無女主持人。" },
    "best_cta": { "score": 8.0, "reason": "結尾有明確呼籲聽眾行動，力道足夠。" },
    "niche_market": { "score": 7.5, "reason": "選題具有一定差異化，但非極度冷門之利基市場。" },
    "atmosphere_night": { "score": 8.0, "reason": "聲音平穩溫和，適合深夜靜聽。" },
    "atmosphere_morning": { "score": 8.5, "reason": "節奏明快，開頭活力十足，提神效果好。" },
    "atmosphere_healing": { "score": 7.0, "reason": "談話較為嚴肅認真，解壓療癒感普通。" },
    "self_exploration": { "score": 9.0, "reason": "深度探討自由人生與自我成長，心靈啟發感極強。" },
    "best_long_form": { "score": null, "reason": "單集時長未達60分鐘。" },
    "best_short_form": { "score": null, "reason": "單集時長大於15分鐘。" },
    "please_continue": { "score": 8.5, "reason": "主持人與聽眾連結深厚，對談真誠有溫度。" }
  }
}
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
            responseMimeType: "application/json",
            temperature: 0.1
        }
    };

    const res = await postRequest(url, headers, body);
    if (res.statusCode !== 200) {
        throw new Error(`Gemini 分析失敗，狀態碼: ${res.statusCode}, 回傳: ${res.body}`);
    }
    
    const parsedData = JSON.parse(res.body);
    const responseText = parsedData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
        throw new Error("模型回傳的 text 內容為空");
    }
    
    return JSON.parse(responseText.trim());
}

async function queryVoiceAnalysis(fileUri, apiKey, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await queryVoiceAnalysisRaw(fileUri, apiKey);
        } catch (err) {
            const isQuota = err.message.includes('429') || err.message.includes('quota') || err.message.includes('QUOTA') || err.message.includes('limit');
            if (isQuota || attempt === retries) {
                throw err;
            }
            console.warn(` ⚠️ 聲音分析失敗 (${err.message})，正在進行第 ${attempt} 次重試...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

async function main() {
    console.log("=================== 軌道 B (聲音特徵物理評估) 批次處理器 ===================");
    
    // 1. Load API Key
    let apiKeyString = process.env.GEMINI_API_KEY;
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/GEMINI_API_KEY\s*=\s*(.*)/);
        if (match) apiKeyString = match[1].trim();
    }
    
    if (!apiKeyString) {
        console.error("❌ 找不到 GEMINI_API_KEY，請在 .env 檔案中配置。");
        return;
    }

    const apiKeys = apiKeyString.split(',').map(k => k.trim()).filter(Boolean);
    console.log(`成功載入 ${apiKeys.length} 個 API Key。`);

    // Parse command line arguments
    const args = process.argv.slice(2);
    const isFullRun = args.includes('--full');
    
    // 2. Load Selected Episodes
    let selectionPath = path.join(__dirname, 'selected_episodes_full.json');
    if (!fs.existsSync(selectionPath)) {
        selectionPath = path.join(__dirname, 'selected_episodes_for_poc.json');
    }
    if (!fs.existsSync(selectionPath)) {
        console.error(`❌ 找不到抽樣單集清單 ${selectionPath}`);
        return;
    }
    
    const selectedEpisodes = JSON.parse(fs.readFileSync(selectionPath, 'utf-8'));
    console.log(`成功加載單集清單 (${path.basename(selectionPath)})，共 ${selectedEpisodes.length} 個單集。`);
    
    // 3. Load or initialize Track B Cache
    const cachePath = path.join(__dirname, 'track_b_results.json');
    let trackBCache = {};
    if (fs.existsSync(cachePath)) {
        try {
            trackBCache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
            console.log(`讀取已存在的聲音評估快取，共包含 ${Object.keys(trackBCache).length} 筆資料。`);
        } catch (e) {
            console.error(" ⚠️ 快取讀取失敗，將重新評估:", e.message);
        }
    }

    // Clean any leftover files from Gemini Files API before starting for all keys
    for (const key of apiKeys) {
        await cleanAllGeminiFiles(key);
    }
    
    // 4. Determine batch execution (limit to stay within free quota)
    // We will process all episodes in selectedEpisodes that are not cached or don't have recommended_segments.
    const LIMIT_TRIAL = !isFullRun;
    const TRIAL_LIMIT_COUNT = 36; // 限制測試跑 36 集 (12 檔節目)
    
    let pendingEpisodes = selectedEpisodes.filter(ep => {
        const cached = trackBCache[ep.title];
        // Re-process if not cached, or if it doesn't have the recommended_segments, or if it lacks award_scores
        return !cached || !cached.recommended_segments || cached.recommended_segments.length === 0 || !cached.award_scores || Object.keys(cached.award_scores).length === 0;
    });
    console.log(`待分析/升級單集數量: ${pendingEpisodes.length}`);
    
    if (LIMIT_TRIAL && pendingEpisodes.length > TRIAL_LIMIT_COUNT) {
        console.log(`💡 模式：限制測試模式 (Trial Mode)。本次執行將僅評估 ${TRIAL_LIMIT_COUNT} 個單集。`);
        console.log(`💡 提示：若要跑完所有 147 集，請執行 node batch_track_b.js --full`);
        pendingEpisodes = pendingEpisodes.slice(0, TRIAL_LIMIT_COUNT);
    } else if (!LIMIT_TRIAL) {
        console.log(`🚀 模式：全量分析模式 (Full Mode)。將依序處理所有 ${pendingEpisodes.length} 個待分析單集。`);
    }
    
    const tempDir = path.join(__dirname, 'temp_audio_b');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    let processedCount = 0;
    let keyIndex = 0;
    let stopAll = false;
    
    for (let i = 0; i < pendingEpisodes.length; i++) {
        if (stopAll) break;
        const ep = pendingEpisodes[i];
        console.log(`\n-------------------------------------------------------------`);
        console.log(`⏳ 正在處理 [${i + 1}/${pendingEpisodes.length}]: ${ep.partnerName} - ${ep.title}`);
        
        const tempFilePath = path.join(tempDir, `temp_audio_${Date.now()}.mp3`);
        let fileUri = null;
        let success = false;
        
        while (!success && keyIndex < apiKeys.length) {
            const currentApiKey = apiKeys[keyIndex];
            
            try {
                // Step A: Download MP3 (only if not already downloaded)
                if (!fs.existsSync(tempFilePath)) {
                    console.log(` -> 正在下載音訊檔案 (Mp3Url)...`);
                    await downloadFileWithRetry(ep.mp3Url, tempFilePath);
                    const fileSizeMb = Math.round(fs.statSync(tempFilePath).size / 1024 / 1024 * 100) / 100;
                    console.log(` -> 下載成功！大小: ${fileSizeMb} MB`);
                }
                
                // Step B: Upload to Gemini Files API
                fileUri = await uploadAudioToGemini(tempFilePath, currentApiKey);
                
                // Step C: Wait for file ACTIVE status
                await waitForFileActive(fileUri, currentApiKey);
                
                // Step D: Query Gemini 2.5 Flash for physical diagnostics
                let result = null;
                let querySuccess = false;
                let queryRetries = 0;
                
                while (!querySuccess) {
                    try {
                        result = await queryVoiceAnalysis(fileUri, currentApiKey);
                        querySuccess = true;
                    } catch (queryErr) {
                        const isQuotaError = queryErr.message.includes('429') || queryErr.message.includes('quota') || queryErr.message.includes('QUOTA') || queryErr.message.includes('limit');
                        if (isQuotaError && queryRetries < 3) {
                            queryRetries++;
                            console.warn(`      ⚠️ 查詢限流 (429/TPM)，將暫停 65 秒後進行第 ${queryRetries} 次重試...`);
                            await new Promise(resolve => setTimeout(resolve, 65000));
                        } else {
                            throw queryErr;
                        }
                    }
                }
                console.log(` -> 分析成功！語速: ${result.speech_rate_wpm}字/分 | 贅字率: ${result.filler_words_level} | 錄音品質: ${result.acoustic_quality_level}`);
                
                // Save to Cache
                trackBCache[ep.title] = {
                    partnerName: ep.partnerName,
                    podcastName: ep.podcastName,
                    title: ep.title,
                    speech_rate_wpm: result.speech_rate_wpm,
                    filler_words_level: result.filler_words_level,
                    filler_words_analysis: result.filler_words_analysis,
                    vocal_resonance: result.vocal_resonance,
                    acoustic_quality_level: result.acoustic_quality_level,
                    acoustic_issues_popping: result.acoustic_issues?.popping || "無",
                    acoustic_issues_clipping: result.acoustic_issues?.clipping || "無",
                    acoustic_issues_noise: result.acoustic_issues?.noise || "無",
                    acoustic_summary: result.acoustic_summary,
                    // Fallback for older dashboard UI compatibility
                    golden_segment_time: result.recommended_segments?.[0]?.time_range || "N/A",
                    golden_segment_reason: result.recommended_segments?.[0]?.reason || "N/A",
                    // Upgraded golden segments
                    recommended_segments: result.recommended_segments || [],
                    award_scores: result.award_scores || {},
                    analyzed_at: new Date().toISOString()
                };
                
                fs.writeFileSync(cachePath, JSON.stringify(trackBCache, null, 2), 'utf-8');
                processedCount++;
                success = true;
                
            } catch (err) {
                const isQuotaError = err.message.includes('429') || err.message.includes('quota') || err.message.includes('QUOTA') || err.message.includes('limit');
                if (isQuotaError) {
                    console.warn(` ⚠️ 當前第 ${keyIndex + 1} 個 API Key 額度已用罄或被限制 (429)。`);
                    keyIndex++;
                    if (fileUri) {
                        await deleteGeminiFile(fileUri, currentApiKey).catch(() => {});
                        fileUri = null;
                    }
                    if (keyIndex < apiKeys.length) {
                        console.log(` 🔄 正在自動切換至第 ${keyIndex + 1} 個 API Key 重試本單集...`);
                        continue;
                    } else {
                        console.warn(` ⚠️ 提示：所有 API Keys 目前均被限流 (429)。將暫停 65 秒等待限流窗口重置，隨後重新輪替重試...`);
                        await new Promise(resolve => setTimeout(resolve, 65000));
                        keyIndex = 0;
                        continue;
                    }
                } else {
                    console.error(` ❌ 處理該單集出錯 (非配額錯誤):`, err.message);
                    success = true; // Skip this episode and continue to the next one
                }
            } finally {
                // Clean up Gemini Files API for the successfully processed episode
                if (fileUri && success) {
                    console.log(` -> 正在刪除 Gemini 雲端暫存檔以釋放空間...`);
                    await deleteGeminiFile(fileUri, currentApiKey).catch(() => {});
                    fileUri = null;
                }
            }
        }
        
        // Clean up local temp file after finishing or skipping the episode
        if (fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (e) {
                console.warn(` ⚠️ 無法刪除本地暫存檔 ${tempFilePath}: ${e.message}`);
            }
        }
        
        // Anti-rate-limit throttling
        if (i < pendingEpisodes.length - 1 && success) {
            console.log(`⏳ 隨機延時 10 秒以避免觸發每分鐘用量上限 (TPM/RPM Guard)...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
        try {
            fs.rmdirSync(tempDir);
        } catch (e) {}
    }

    // Run clean up at the end too for all keys
    for (const key of apiKeys) {
        await cleanAllGeminiFiles(key);
    }
    
    console.log(`\n=================== 聲音診斷階段完成 ===================`);
    console.log(`本輪共分析了 ${processedCount} 個新單集。`);
    
    // 5. Write to Excel eligible_episodes_pool.xlsx
    const excelPath = path.join(__dirname, 'eligible_episodes_pool.xlsx');
    if (fs.existsSync(excelPath)) {
        console.log("\n正在將聲音評估快取庫寫入 Excel 評分表分頁 (聲音物理評估)...");
        const workbookWrite = XLSX.readFile(excelPath);
        
        // Remove existing "聲音物理評估" sheet if it exists
        if (workbookWrite.Sheets["聲音物理評估"]) {
            delete workbookWrite.Sheets["聲音物理評估"];
            const idx = workbookWrite.SheetNames.indexOf("聲音物理評估");
            if (idx > -1) {
                workbookWrite.SheetNames.splice(idx, 1);
            }
        }
        
        // Prepare rows for Excel from all cached items sorted by partnerName then title
        const excelRows = [];
        const cacheItems = Object.values(trackBCache);
        cacheItems.sort((a, b) => {
            const compPartner = a.partnerName.localeCompare(b.partnerName, 'zh-Hant');
            if (compPartner !== 0) return compPartner;
            return a.title.localeCompare(b.title, 'zh-Hant');
        });

        cacheItems.forEach(cacheItem => {
            const seg1 = cacheItem.recommended_segments?.[0] || {};
            const seg2 = cacheItem.recommended_segments?.[1] || {};
            const seg3 = cacheItem.recommended_segments?.[2] || {};
            excelRows.push({
                "合作夥伴": cacheItem.partnerName,
                "節目名稱": cacheItem.podcastName,
                "單集標題": cacheItem.title,
                "語速 (字/分)": cacheItem.speech_rate_wpm,
                "贅字等級": cacheItem.filler_words_level,
                "贅字分析": cacheItem.filler_words_analysis,
                "聲音共鳴特質": cacheItem.vocal_resonance,
                "錄音品質等級": cacheItem.acoustic_quality_level,
                "製播缺陷-噴麥": cacheItem.acoustic_issues_popping,
                "製播缺陷-爆音": cacheItem.acoustic_issues_clipping,
                "製播缺陷-環境底噪": cacheItem.acoustic_issues_noise,
                "音質整體說明": cacheItem.acoustic_summary,
                "推薦黃金聽點區間": cacheItem.golden_segment_time || seg1.time_range || "N/A",
                "黃金聽點推薦理由": cacheItem.golden_segment_reason || seg1.reason || "N/A",
                "推薦片段一標題": seg1.title || "N/A",
                "推薦片段一區間": seg1.time_range || "N/A",
                "推薦片段一理由": seg1.reason || "N/A",
                "推薦片段二標題": seg2.title || "N/A",
                "推薦片段二區間": seg2.time_range || "N/A",
                "推薦片段二理由": seg2.reason || "N/A",
                "推薦片段三標題": seg3.title || "N/A",
                "推薦片段三區間": seg3.time_range || "N/A",
                "推薦片段三理由": seg3.reason || "N/A",
                "評估時間": cacheItem.analyzed_at
            });
        });
        
        const wsNew = XLSX.utils.json_to_sheet(excelRows);
        XLSX.utils.book_append_sheet(workbookWrite, wsNew, "聲音物理評估");
        XLSX.writeFile(workbookWrite, excelPath);
        console.log(`🎉 Excel 評分表分頁已成功寫入至: ${excelPath}`);
    } else {
        console.warn("\n未找到 eligible_episodes_pool.xlsx，略過 Excel 聲音數據寫入。");
    }
}

main();

const fs = require('fs');
const path = require('path');
const https = require('https');

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
                                if (file.displayName && (file.displayName.startsWith('temp_audio') || file.name.startsWith('files/temp_audio'))) {
                                    await deleteGeminiFile(file.name, apiKey);
                                    count++;
                                }
                            }
                        }
                    } catch (e) {}
                }
                resolve();
            });
        }).on('error', () => resolve());
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
    console.log("   -> 等待雲端音訊檔案 ACTIVE (轉檔中)...");
    let retries = 30;
    while (retries > 0) {
        const fileInfo = await getFileState(fileUri, apiKey);
        const state = fileInfo.state;
        if (state === 'ACTIVE') {
            return;
        } else if (state === 'FAILED') {
            throw new Error("Gemini 處理音訊檔案失敗。");
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
        retries--;
    }
    throw new Error("等待檔案 ACTIVE 超時。");
}

// 8. Analyze audio voice features using Gemini 2.5 Flash
async function queryVoiceAnalysisRaw(fileUri, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const headers = { 'Content-Type': 'application/json' };
    
    const prompt = `
你是一位專業的聲音評審。請聆聽並評估這檔節目單集的說話物理特徵與錄音品質，並針對下列各點進行打分與回覆：

1. 語速 (Speech Rate)：估算主講人說話的平均語速（每分鐘約多少字，例如 195 字/分）。
2. 贅字分析 (Filler Words)：評定贅字頻率等級（低、中、高），並具體說明常出現的口頭禪或贅字（如「呃」、「然後」、「就是」、「那」的出現頻率與習慣）。
3. 聲音共鳴特質 (Vocal Resonance)：評定主講人聲音的親和力與共鳴感。特別針對男主持人檢測「中低音共鳴與厚實度」；女主持人檢測「高音域圓潤度與溫馨陪伴感」，並說明是否刺耳。
4. 錄音品質等級 (Acoustic Quality Level)：判定錄音品質（優、中、差），並檢測是否有以下物理缺陷：
   - 噴麥 (popping)
   - 突兀爆音 (clipping)
   - 背景雜音或環境噪音 (noise/hiss)
5. 推薦黃金片段 (Recommended Listen Segments)：請在整集音檔中，尋找並挑選出【3個最精彩的黃金片段】。每個片段都必須標註具體的時間軸範圍、自訂的片段標題以及詳細的推薦理由。

請務必以繁體中文且標準的 JSON 格式輸出（不要輸出 markdown 標記包裝，直接輸出純 JSON 字串）：
{
  "speech_rate_wpm": 205,
  "filler_words_level": "中",
  "filler_words_analysis": "常在句首使用「然後」進行轉折...",
  "vocal_resonance": "聲音厚實，共鳴感強，語調情感豐富...",
  "acoustic_quality_level": "優",
  "acoustic_issues": {
    "popping": "無",
    "clipping": "無",
    "noise": "環境安靜，幾乎無底噪"
  },
  "acoustic_summary": "整體錄音品質優良，音量平穩，沒有突兀爆音與噴麥現象。",
  "recommended_segments": [
    {
      "time_range": "00:00 - 02:30",
      "title": "破題精采開場",
      "reason": "主持人故事破題，迅速抓住聽眾注意力。"
    },
    {
      "time_range": "15:40 - 18:20",
      "title": "核心觀點深度剖析",
      "reason": "情感飽滿，極具聲音說服力。"
    },
    {
      "time_range": "28:15 - 31:00",
      "title": "溫暖結語與聽眾互動",
      "reason": "結尾處聲音共鳴極佳，溫馨且具陪伴感。"
    }
  ]
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
            console.warn(`   ⚠️ 聲音分析失敗 (${err.message})，正在進行第 ${attempt} 次重試...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

// Main execution exported method
async function runVoiceAnalysisForEpisode(episode, apiKey, tempDir) {
    const tempFilePath = path.join(tempDir, `temp_audio_${Date.now()}.mp3`);
    let fileUri = null;
    
    try {
        // Step 1: Download MP3
        console.log(`   -> 正在下載音訊檔案 (Mp3Url)...`);
        await downloadFileWithRetry(episode.mp3Url, tempFilePath);
        const fileSizeMb = Math.round(fs.statSync(tempFilePath).size / 1024 / 1024 * 100) / 100;
        console.log(`   -> 下載成功！大小: ${fileSizeMb} MB`);
        
        // Step 2: Upload to Gemini
        console.log(`   -> 正在上傳至 Gemini Files API...`);
        fileUri = await uploadAudioToGemini(tempFilePath, apiKey);
        
        // Step 3: Wait for ACTIVE status
        await waitForFileActive(fileUri, apiKey);
        
        // Step 4: Run voice physical analysis
        console.log(`   -> 正在進行物理聲音診斷...`);
        const result = await queryVoiceAnalysis(fileUri, apiKey);
        
        // Clean up immediately from Gemini cloud
        await deleteGeminiFile(fileUri, apiKey).catch(() => {});
        fileUri = null;
        
        // Clean up local temp file
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
        
        return result;
    } catch (err) {
        // Cleanup if anything fails
        if (fileUri) {
            await deleteGeminiFile(fileUri, apiKey).catch(() => {});
        }
        if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch(e) {}
        }
        throw err;
    }
}

module.exports = {
    runVoiceAnalysisForEpisode,
    cleanAllGeminiFiles
};

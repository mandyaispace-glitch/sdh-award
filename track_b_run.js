const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Helper to fetch/download binary file
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                // Redirect
                return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

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
            req.write(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

async function uploadAudioToGemini(filePath, apiKey) {
    console.log(" -> [1/3] 正在準備上傳音訊檔案到 Gemini Files API...");
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
    console.log(" -> [2/3] 正在傳送音訊數據 (此步驟取決於您的網路頻寬)...");
    
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
    console.log(` -> [3/3] 上傳成功！檔案識別 URI: ${uploadData.file.uri}`);
    return uploadData.file.uri;
}

async function queryGeminiModel(fileUri, apiKey) {
    console.log(" -> 正在發送評估 Prompt 給 Gemini 2.5 Pro 進行分析...");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
    const headers = { 'Content-Type': 'application/json' };
    
    const prompt = `
你是一位專業的 Podcast 聲音與金鐘獎評審。請聽這段音檔，針對下列三個獎項進行評估打分（1.0 到 10.0 分，最小級距 0.5 分，例如 8.0, 8.5, 9.0），並給出專業的評語：

1. 【雙人/多人組主持默契】 (Duo Chemistry)：評估雙人主持或主持與來賓的對話流暢度。檢測有無尷尬空白 (1.5秒以上死寂)、搶話或打斷的頻率，並特別偵測有無在相同時間軸出現「同步共鳴笑聲」的物理特徵。
2. 【個人主持聲線魅力】 (Host Vocal Magnetism)：評估主持人口條與聲線。檢測語速是否穩定在 180–220 字/分鐘舒適區間、是否有感情豐富的音調波動起伏 (避免唸稿機器人感)。特別針對男主持人檢測「中低音共鳴與厚實度」；女主持人檢測「高音域圓潤度與溫馨陪伴感」，並指出是否刺耳。
3. 【錄音製播與音質品質】 (Acoustic Quality)：評估錄音製播水平。檢測有無突兀爆音、噴麥、環境底噪雜訊，以及音量是否忽大忽小，並提供製播建議。

另外，請強制抓出一段「黃金 3 分鐘」的時間軸（例如: 12:30-15:30），說明這是全集中情緒張力、互動最精彩的片段（例如出現精彩火花或雙人共鳴等），並簡述原因。

請務必以繁體中文且標準的 JSON 格式輸出：
{
  "scores": {
    "duo_chemistry": { "score": 8.5, "reason": "說明雙人接話流暢度、插話搶話與共鳴笑聲同步率..." },
    "host_vocal_magnetism": { "score": 9.0, "reason": "說明個人說話語速穩定度、情感音調起伏、以及男聲中低音共鳴度或女聲高音圓潤溫暖度..." },
    "acoustic_quality": { "score": 8.0, "reason": "說明雜訊、噴麥、爆音或音量不均等製播品質，並提供建議..." }
  },
  "golden_3_minutes": {
    "start_time": "MM:SS",
    "end_time": "MM:SS",
    "start_sentence": "在此寫入該片段開頭第一句主持人口中吐出的精確對話文字內容 (不低於10字，供後續逐字稿反查驗證)...",
    "end_sentence": "在此寫入該片段結束最後一句主持人口中吐出的精確對話文字內容 (不低於10字，供後續逐字稿反查驗證)...",
    "reason": "說明為什麼這段最精采..."
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
            temperature: 0.0
        }
    };

    
    const res = await postRequest(url, headers, body);
    if (res.statusCode !== 200) {
        throw new Error(`Gemini 分析失敗，狀態碼: ${res.statusCode}, 回傳: ${res.body}`);
    }
    
    return JSON.parse(res.body);
}

async function main() {
    console.log("=================== 軌道 B (聲音特徵軌) 測試執行 ===================");
    
    // 1. Check API Key
    let apiKey = process.env.GEMINI_API_KEY;
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const match = envContent.match(/GEMINI_API_KEY\s*=\s*(.*)/);
        if (match) apiKey = match[1].trim();
    }
    
    if (!apiKey) {
        console.error("❌ 找不到 GEMINI_API_KEY。");
        console.log("\n【說明】因為軌道 B 需要分析音檔物理特徵，必須呼叫 Gemini 1.5 Pro。");
        console.log("請完成以下步驟以執行測試：");
        console.log("1. 前往 Google AI Studio 申請免費 API Key：https://aistudio.google.com/");
        console.log(`2. 在此目錄下建立 .env 檔案，並填入：GEMINI_API_KEY = your_key_here`);
        console.log("3. 再次執行 `node track_b_run.js`。\n");
        return;
    }
    
    // 2. Select a demo MP3 file (we download a short sample MP3 to save time and bandwidth for the demo)
    const demoMp3Url = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"; // A 6-minute sample audio
    const tempFilePath = path.join(__dirname, 'demo_sample.mp3');
    
    console.log(`正在從網路下載 Demo 測試音檔 (長度約 6 分鐘，來源: SoundHelix)...`);
    try {
        await downloadFile(demoMp3Url, tempFilePath);
        console.log(`音檔已下載至本地: ${tempFilePath} (${Math.round(fs.statSync(tempFilePath).size / 1024 / 1024 * 100) / 100} MB)`);
        
        // 3. Upload to Gemini File API
        const fileUri = await uploadAudioToGemini(tempFilePath, apiKey);
        
        // 4. Query Model
        const analysisResult = await queryGeminiModel(fileUri, apiKey);
        console.log("\n🎉 Gemini 1.5 Pro 分析結果回傳成功：\n");
        
        // Try parsing candidate response text
        const responseText = analysisResult.candidates?.[0]?.content?.parts?.[0]?.text;
        if (responseText) {
            const parsedJson = JSON.parse(responseText.trim());
            console.log(JSON.stringify(parsedJson, null, 2));
        } else {
            console.log(JSON.stringify(analysisResult, null, 2));
        }
        
    } catch (e) {
        console.error("\n❌ 軌道 B 執行失敗:", e.message);
    } finally {
        // Cleanup temp file
        if (fs.existsSync(tempFilePath)) {
            console.log(`\n清理暫存音檔: ${tempFilePath}`);
            fs.unlinkSync(tempFilePath);
        }
    }
}

main();

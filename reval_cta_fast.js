const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const https = require('https');

const tempDir = path.join(__dirname, 'temp_audio_cta');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// 1. Download Helper
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const cmd = 'curl.exe -L -s --fail -A "Mozilla/5.0" -o "' + destPath + '" "' + url + '"';
        exec(cmd, { timeout: 300000 }, (error) => {
            if (error) return reject(new Error('curl 下載失敗: ' + error.message));
            resolve();
        });
    });
}
function downloadFileWithRetry(url, destPath, retries = 3) {
    return downloadFile(url, destPath).catch((err) => {
        if (retries > 1) {
            console.warn(' ⚠️ 下載失敗 (' + err.message + ')，重試中...');
            return new Promise(resolve => setTimeout(resolve, 3000)).then(() => downloadFileWithRetry(url, destPath, retries - 1));
        }
        throw err;
    });
}

// 2. HTTP POST
function postRequest(url, headers, body, timeoutMs = 600000) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = { hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'POST', headers: headers, timeout: timeoutMs };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve({ statusCode: res.statusCode, body: data }); });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        if (body) req.write(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

// 3. Gemini Helpers
async function deleteGeminiFile(fileUri, apiKey) {
    const fileId = fileUri.split('/').pop();
    const url = 'https://generativelanguage.googleapis.com/v1beta/files/' + fileId + '?key=' + apiKey;
    return new Promise((resolve) => {
        const req = https.request(new URL(url), { method: 'DELETE' }, (res) => resolve(res.statusCode === 200));
        req.on('error', () => resolve(false));
        req.end();
    });
}
async function cleanAllGeminiFiles(apiKey) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/files?key=' + apiKey;
    return new Promise(resolve => {
        https.get(url, (res) => {
            let data = ''; res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                if (res.statusCode === 200) {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.files) {
                            for (const file of parsed.files) {
                                if (file.displayName && file.displayName.includes('cta')) {
                                    await deleteGeminiFile(file.name, apiKey);
                                }
                            }
                        }
                    } catch (e) {}
                }
                resolve();
            });
        }).on('error', resolve);
    });
}
async function uploadAudioToGemini(filePath, apiKey) {
    const fileSize = fs.statSync(filePath).size;
    const initUrl = 'https://generativelanguage.googleapis.com/upload/v1beta/files?key=' + apiKey;
    const initHeaders = {
        'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': fileSize.toString(),
        'X-Goog-Upload-Header-Content-Type': 'audio/mp3', 'Content-Type': 'application/json'
    };
    const initBody = JSON.stringify({ file: { displayName: path.basename(filePath) } });
    const initRes = await new Promise((resolve, reject) => {
        const req = https.request(new URL(initUrl), { method: 'POST', headers: initHeaders }, (res) => {
            resolve({ statusCode: res.statusCode, uploadUrl: res.headers['x-goog-upload-url'] });
        });
        req.on('error', reject); req.write(initBody); req.end();
    });
    if (!initRes.uploadUrl) throw new Error('Init failed: ' + initRes.statusCode);
    const fileBuffer = fs.readFileSync(filePath);
    const uploadRes = await postRequest(initRes.uploadUrl, { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize', 'Content-Length': fileSize.toString() }, fileBuffer);
    if (uploadRes.statusCode !== 200) throw new Error('Upload failed: ' + uploadRes.statusCode);
    return JSON.parse(uploadRes.body).file.uri;
}
async function waitForFileActive(fileUri, apiKey) {
    const fileId = fileUri.split('/').pop();
    const url = 'https://generativelanguage.googleapis.com/v1beta/files/' + fileId + '?key=' + apiKey;
    for (let i = 0; i < 30; i++) {
        const state = await new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = ''; res.on('data', c => data += c);
                res.on('end', () => {
                    if (res.statusCode !== 200) reject(new Error('Failed get state'));
                    else resolve(JSON.parse(data).state);
                });
            }).on('error', reject);
        });
        if (state === 'ACTIVE') return;
        if (state === 'FAILED') throw new Error('File failed');
        await new Promise(r => setTimeout(r, 5000));
    }
    throw new Error('Timeout waiting ACTIVE');
}

// 4. CTA Query
async function queryCTA(fileUri, apiKey) {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
    const prompt = '你是一位專業的金鐘獎廣播與 Podcast 評審。請聆聽這檔節目，並「僅針對」以下這個獎項重新進行嚴格打分：\n\n' +
                   '"best_cta": 聽完馬上獎/推坑王\n' +
                   '(嚴格評估主持人推坑「具體商品、課程、或付費服務」的勸敗說服力。若僅是呼籲聽眾「按讚、訂閱、留言、分享」，或是該集根本無商業推坑行為，請一律給予 null。分數取決於讓人聽完想掏錢購買的衝動程度，1.0到10.0，請嚴格給分，不要隨便給高分)\n\n' +
                   '請務必以繁體中文且標準的 JSON 格式輸出：\n' +
                   '{ "best_cta": { "score": 8.5, "reason": "節目後段強烈推銷線上財報課程，限時折扣優惠極具煽動性，讓人很有購買衝動。" } }\n' +
                   '(若無推坑實體商品或付費服務，score請直接填 null)';
    const body = {
        contents: [{ parts: [{ fileData: { fileUri: fileUri, mimeType: "audio/mp3" } }, { text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
    };
    const res = await postRequest(url, { 'Content-Type': 'application/json' }, body);
    if (res.statusCode !== 200) throw new Error('Gen failed: ' + res.statusCode);
    
    // Parse double JSON
    const outerJson = JSON.parse(res.body);
    const textContent = outerJson.candidates[0].content.parts[0].text.trim();
    // Strip markdown formatting if any
    const cleanText = textContent.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanText);
}

// 5. Main Concurrent Runner
async function main() {
    let apiKeyString = process.env.GEMINI_API_KEY;
    if (fs.existsSync('.env')) {
        const envContent = fs.readFileSync('.env', 'utf-8');
        const match = envContent.match(/GEMINI_API_KEY\s*=\s*(.*)/);
        if (match) apiKeyString = match[1].trim();
    }
    const apiKeys = apiKeyString.split(',').map(k => k.trim()).filter(Boolean);
    console.log('✅ Loaded ' + apiKeys.length + ' API Keys');
    
    for (const key of apiKeys) await cleanAllGeminiFiles(key);

    const selectionPath = 'selected_episodes_full.json';
    const selectedEpisodes = JSON.parse(fs.readFileSync(selectionPath, 'utf-8'));
    const cachePath = 'track_b_results.json';
    let trackBCache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    
    const pendingEpisodes = selectedEpisodes;
    
    const concurrencyLimit = 5;
    let currentIndex = 0;
    
    async function worker(workerId) {
        while (currentIndex < pendingEpisodes.length) {
            const i = currentIndex++;
            const ep = pendingEpisodes[i];
            const tempFilePath = path.join(tempDir, 'temp_audio_cta_' + Date.now() + '_' + workerId + '.mp3');
            let fileUri = null, success = false, keyIndex = 0;
            
            console.log('[W' + workerId + '] ⏳ 處理 [' + (i + 1) + '/' + pendingEpisodes.length + ']: ' + ep.partnerName + ' - ' + ep.title);
            
            while (!success && keyIndex < apiKeys.length) {
                const currentApiKey = apiKeys[keyIndex];
                try {
                    if (!fs.existsSync(tempFilePath)) {
                        await downloadFileWithRetry(ep.mp3Url, tempFilePath);
                    }
                    fileUri = await uploadAudioToGemini(tempFilePath, currentApiKey);
                    await waitForFileActive(fileUri, currentApiKey);
                    
                    let result = null, queryRetries = 0, querySuccess = false;
                    while (!querySuccess) {
                        try {
                            result = await queryCTA(fileUri, currentApiKey);
                            querySuccess = true;
                        } catch (qErr) {
                            if (qErr.message.includes('429') && queryRetries < 3) {
                                queryRetries++;
                                await new Promise(r => setTimeout(r, 10000));
                            } else throw qErr;
                        }
                    }
                    
                    const score = result.best_cta ? result.best_cta.score : 'null';
                    console.log('[W' + workerId + '] -> 推坑王重新評分: ' + score);
                    
                    if (trackBCache[ep.title] && trackBCache[ep.title].award_scores) {
                        trackBCache[ep.title].award_scores.best_cta = result.best_cta;
                        fs.writeFileSync(cachePath, JSON.stringify(trackBCache, null, 2));
                    }
                    success = true;
                } catch (err) {
                    if (err.message.includes('429')) {
                        keyIndex++;
                        if (fileUri) await deleteGeminiFile(fileUri, currentApiKey).catch(()=>{});
                        if (keyIndex < apiKeys.length) continue;
                        await new Promise(r => setTimeout(r, 10000));
                        keyIndex = 0; continue;
                    } else {
                        console.error('[W' + workerId + '] ❌ Error:', err.message);
                        if (keyIndex < apiKeys.length - 1) {
                            keyIndex++;
                            if (fileUri) await deleteGeminiFile(fileUri, currentApiKey).catch(()=>{});
                            continue;
                        }
                        success = true; // skip
                    }
                } finally {
                    if (fileUri) await deleteGeminiFile(fileUri, currentApiKey).catch(()=>{});
                    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
                }
            }
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    
    console.log('🚀 啟動推坑王(CTA)高速重評引擎，並發數: ' + concurrencyLimit);
    const workers = Array.from({length: concurrencyLimit}, (_, i) => worker(i + 1));
    await Promise.all(workers);
    
    console.log("✅ CTA 重評完成！");
}

main();

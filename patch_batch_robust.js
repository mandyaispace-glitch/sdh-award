const fs = require('fs');

let code = fs.readFileSync('batch_track_b.js', 'utf8');

// Replace postRequest completely
const postReqStart = code.indexOf('function postRequest(url, headers, body, timeoutMs');
const postReqEnd = code.indexOf('// Helper to upload audio to Gemini Files API');
if (postReqStart > -1 && postReqEnd > postReqStart) {
    const newPostReq = `function postRequest(url, headers, body, timeoutMs = 600000) { // 10 minutes timeout
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: headers,
            timeout: timeoutMs
        };
        const req = require('https').request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve({ statusCode: res.statusCode, body: data }); });
        });
        req.on('error', (err) => { reject(err); });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(\`請求超時 (\${timeoutMs}ms)\`));
        });
        if (body) {
            req.write(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

`;
    code = code.substring(0, postReqStart) + newPostReq + code.substring(postReqEnd);
}

// Replace downloadFile completely
const dlStart = code.indexOf('function downloadFile(url, destPath) {');
const dlEnd = code.indexOf('// 2. Download helper with retry logic');
if (dlStart > -1 && dlEnd > dlStart) {
    const newDl = `function downloadFile(url, destPath) {
    const timeoutMs = 600000;
    return new Promise((resolve, reject) => {
        let isDone = false;
        const file = require('fs').createWriteStream(destPath);
        
        const timer = setTimeout(() => {
            if (isDone) return;
            isDone = true;
            file.close(() => {
                require('fs').unlink(destPath, () => {});
                reject(new Error(\`下載超時 (\${timeoutMs}ms)\`));
            });
        }, timeoutMs);

        const protocol = url.startsWith('https') ? require('https') : require('http');
        const req = protocol.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                file.close(() => {
                    require('fs').unlink(destPath, () => {});
                    clearTimeout(timer);
                    downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
                });
                return;
            }
            if (response.statusCode !== 200) {
                file.close(() => {
                    require('fs').unlink(destPath, () => {});
                    clearTimeout(timer);
                    reject(new Error(\`下載失敗，狀態碼: \${response.statusCode}\`));
                });
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                if (isDone) return;
                isDone = true;
                file.close(() => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }).on('error', (err) => {
            if (isDone) return;
            isDone = true;
            file.close(() => {
                require('fs').unlink(destPath, () => {});
                clearTimeout(timer);
                reject(err);
            });
        });
        req.on('timeout', () => { req.destroy(); });
        req.setTimeout(timeoutMs);
    });
}

`;
    code = code.substring(0, dlStart) + newDl + code.substring(dlEnd);
}

// Replace queryVoiceAnalysis completely
const qvaStart = code.indexOf('// Helper to query with retry logic');
const qvaEnd = code.indexOf('// ===============================\r\n// Helper to wait for file to be ACTIVE');
if (qvaEnd === -1) {
    // try \n
    code = code.replace(/async function queryVoiceAnalysis\(fileUri, apiKey, retries = 3\) \{[\s\S]*?\}\n\}\n/g, 
`// Wrapper for queryVoiceAnalysisRaw to enforce a hard global timeout (5 minutes)
async function queryVoiceAnalysisRawWithTimeout(fileUri, apiKey) {
    const timeoutMs = 600000; // 10 minutes
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(\`Gemini API 靜默超時 (\${timeoutMs}ms) - 無回應\`));
        }, timeoutMs);
        
        queryVoiceAnalysisRaw(fileUri, apiKey)
            .then(res => {
                clearTimeout(timer);
                resolve(res);
            })
            .catch(err => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

// Helper to query with retry logic
async function queryVoiceAnalysis(fileUri, apiKey, retries = 3) {
    let attempt = 0;
    while (attempt <= retries) {
        attempt++;
        try {
            return await queryVoiceAnalysisRawWithTimeout(fileUri, apiKey);
        } catch (err) {
            const isQuota = err.message.includes('429') || err.message.includes('quota') || err.message.includes('QUOTA') || err.message.includes('limit');
            const isTimeout = err.message.includes('超時') || err.message.includes('timeout') || err.message.includes('socket');
            
            // Allow retry on quota or timeout
            if (isQuota && attempt <= retries) {
                console.warn(\` ⚠️ API 額度用罄 (\${err.message})，正在進行第 \${attempt} 次重試...\`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else if (attempt <= retries) {
                console.warn(\` ⚠️ 聲音分析失敗 (\${err.message})，正在進行第 \${attempt} 次重試...\`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
                throw err;
            }
        }
    }
}
`);
}

// Replace the catch logic
code = code.replace(/console\.error\(\` ❌ 處理該單集出錯 \(非配額錯誤\):\`, err\.message\);\s*success = true; \/\/ Skip this episode and continue to the next one/g,
`console.error(\` ❌ 處理該單集出錯 (非配額錯誤):\`, err.message);
                    if (keyIndex < apiKeys.length - 1) {
                         console.log(\` 🔄 發生未知錯誤，嘗試切換備用 API Key 重新處理本集...\`);
                         keyIndex++;
                         if (fileUri) {
                             await deleteGeminiFile(fileUri, currentApiKey).catch(() => {});
                             fileUri = null;
                         }
                         continue;
                    } else {
                         console.error(\` ❌ 該單集重試次數已達上限，強制略過。\`);
                         success = true; // Skip this episode and continue to the next one
                    }`);

fs.writeFileSync('batch_track_b.js', code, 'utf8');
console.log("batch_track_b.js completely patched!");

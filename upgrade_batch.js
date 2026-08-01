const fs = require('fs');

let code = fs.readFileSync('batch_track_b.js', 'utf8');

// 1. Fix timeout in postRequest to 10 minutes (600000ms)
code = code.replace(/timeoutMs = \d+/g, 'timeoutMs = 600000');
code = code.replace(/\(180000ms\)/g, '(600000ms)');
code = code.replace(/\(300000ms\)/g, '(600000ms)');
code = code.replace(/300000;/g, '600000;');
code = code.replace(/180000;/g, '600000;');

// 2. Reduce the 65000ms wait to 10000ms (for paid API burst limits)
code = code.replace(/65000/g, '10000');

// 3. Replace the sequential loop with a concurrent pool
const loopStart = code.indexOf('for (let i = 0; i < pendingEpisodes.length; i++) {');
const loopEnd = code.lastIndexOf('} else {');
const mainEnd = code.lastIndexOf('}', loopEnd + 2000); // end of the loop

// We will inject the concurrent wrapper
if (loopStart > -1) {
    const loopContent = code.substring(loopStart, mainEnd + 1);
    
    // Extract the inner body of the loop
    const innerBodyMatch = loopContent.match(/for \(let i = 0; i < pendingEpisodes\.length; i\+\+\) \{([\s\S]*)\n    \}/);
    if (innerBodyMatch) {
        const innerBody = innerBodyMatch[1];
        
        const concurrentCode = `
    const concurrencyLimit = 5;
    let currentIndex = 0;
    
    async function processNextWorker(workerId) {
        while (currentIndex < pendingEpisodes.length) {
            if (stopAll) break;
            const i = currentIndex++;
            const ep = pendingEpisodes[i];
            
            // Generate a unique temp file path per worker to avoid collisions
            const tempFilePath = path.join(tempDir, \`temp_audio_\${Date.now()}_\${workerId}.mp3\`);
            let fileUri = null;
            let success = false;
            let keyIndex = 0;
            
            console.log(\`\\n[Worker \${workerId}] ⏳ 正在處理 [\${i + 1}/\${pendingEpisodes.length}]: \${ep.partnerName} - \${ep.title}\`);
            
            while (!success && keyIndex < apiKeys.length) {
                const currentApiKey = apiKeys[keyIndex];
                try {
                    // Step A: Download
                    if (!fs.existsSync(tempFilePath)) {
                        console.log(\`[Worker \${workerId}] -> 正在下載音訊檔案 (Mp3Url)...\`);
                        await downloadFileWithRetry(ep.mp3Url, tempFilePath);
                        const fileSizeMb = Math.round(fs.statSync(tempFilePath).size / 1024 / 1024 * 100) / 100;
                        console.log(\`[Worker \${workerId}] -> 下載成功！大小: \${fileSizeMb} MB\`);
                    }
                    
                    // Step B: Upload
                    fileUri = await uploadAudioToGemini(tempFilePath, currentApiKey);
                    await waitForFileActive(fileUri, currentApiKey);
                    
                    // Step C: Query
                    let result = null;
                    let querySuccess = false;
                    let queryRetries = 0;
                    
                    while (!querySuccess) {
                        try {
                            result = await queryVoiceAnalysis(fileUri, currentApiKey, 0);
                            querySuccess = true;
                        } catch (queryErr) {
                            const isQuotaError = queryErr.message.includes('429') || queryErr.message.includes('quota') || queryErr.message.includes('limit');
                            if (isQuotaError && queryRetries < 3) {
                                queryRetries++;
                                console.warn(\`[Worker \${workerId}] ⚠️ 限流 (429/TPM)，暫停 10 秒後重試...\`);
                                await new Promise(resolve => setTimeout(resolve, 10000));
                            } else {
                                throw queryErr;
                            }
                        }
                    }
                    console.log(\`[Worker \${workerId}] -> 分析成功！語速: \${result.speech_rate_wpm}字/分\`);
                    
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
                        award_scores: result.award_scores,
                        golden_segment: "參見 recommended_segments",
                        golden_segment_reason: "參見 recommended_segments",
                        recommended_segments: result.recommended_segments || [],
                        overall_summary: result.overall_summary,
                        analyzed_at: new Date().toISOString()
                    };
                    
                    // Flush cache
                    fs.writeFileSync(cachePath, JSON.stringify(trackBCache, null, 2), 'utf-8');
                    success = true;
                } catch (err) {
                    const isQuotaError = err.message.includes('429') || err.message.includes('quota') || err.message.includes('limit');
                    if (isQuotaError) {
                        keyIndex++;
                        if (fileUri) { await deleteGeminiFile(fileUri, currentApiKey).catch(() => {}); fileUri = null; }
                        if (keyIndex < apiKeys.length) continue;
                        else {
                            await new Promise(resolve => setTimeout(resolve, 10000));
                            keyIndex = 0; continue;
                        }
                    } else {
                        console.error(\`[Worker \${workerId}] ❌ 處理該單集出錯:\`, err.message);
                        if (keyIndex < apiKeys.length - 1) {
                            keyIndex++;
                            if (fileUri) { await deleteGeminiFile(fileUri, currentApiKey).catch(() => {}); fileUri = null; }
                            continue;
                        } else {
                            success = true; // skip
                        }
                    }
                } finally {
                    if (fileUri) { await deleteGeminiFile(fileUri, currentApiKey).catch(() => {}); }
                    if (fs.existsSync(tempFilePath)) { fs.unlinkSync(tempFilePath); }
                }
            }
        }
    }
    
    console.log(\`🚀 啟用付費加速模式：並發處理數量 \${concurrencyLimit}\`);
    const workers = [];
    for (let w = 1; w <= concurrencyLimit; w++) {
        workers.push(processNextWorker(w));
    }
    await Promise.all(workers);
`;

        code = code.replace(loopContent, concurrentCode);
    }
}

fs.writeFileSync('batch_track_b_fast.js', code, 'utf8');
console.log("batch_track_b_fast.js created!");

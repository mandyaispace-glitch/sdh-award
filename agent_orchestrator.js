const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const XLSX = require('xlsx');

// Load Sub-Agents
const voiceAgent = require('./agents/agent_track_b');
const dataAgent = require('./agents/agent_track_c');
const textAgent = require('./agents/agent_track_a');

// Load API Keys from .env
function loadEnvKeys() {
    let geminiApiKeysString = process.env.GEMINI_API_KEY || '';
    let youtubeApiKey = process.env.YOUTUBE_API_KEY || '';
    
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const geminiMatch = envContent.match(/GEMINI_API_KEY\s*=\s*(.*)/);
        if (geminiMatch) geminiApiKeysString = geminiMatch[1].trim();
        
        const ytMatch = envContent.match(/YOUTUBE_API_KEY\s*=\s*(.*)/);
        if (ytMatch) youtubeApiKey = ytMatch[1].trim();
    }
    
    const geminiApiKeys = geminiApiKeysString.split(',').map(k => k.trim()).filter(Boolean);
    return { geminiApiKeys, youtubeApiKey };
}

async function main() {
    console.log("=================== 📋 SDH 鬧鐘獎 AI 代理團隊主控台 ===================");
    
    const { geminiApiKeys, youtubeApiKey } = loadEnvKeys();
    if (geminiApiKeys.length === 0) {
        console.error("❌ 錯誤：找不到 GEMINI_API_KEY。請確認專案根目錄下有 .env 設定檔。");
        return;
    }
    console.log(`[隊長 AI] 成功載入 ${geminiApiKeys.length} 組 Gemini API 金鑰。`);
    if (youtubeApiKey) {
        console.log(`[隊長 AI] 成功載入 YouTube API 金鑰。將啟用自動 YT 頻道數據爬取！`);
    } else {
        console.log(`[隊長 AI] 提示：未配置 YOUTUBE_API_KEY，將略過 YT 數據自動採集。`);
    }
    
    // Command line flags
    const args = process.argv.slice(2);
    const isTestRun = args.includes('--test');
    const isFullRun = args.includes('--full');
    
    // 1. Load Episode Pool
    let selectionPath = path.join(__dirname, 'selected_episodes_full.json');
    if (!fs.existsSync(selectionPath)) {
        selectionPath = path.join(__dirname, 'selected_episodes_for_poc.json');
    }
    if (!fs.existsSync(selectionPath)) {
        console.error(`❌ 錯誤：找不到節目清單選集檔 ${selectionPath}`);
        return;
    }
    
    const selectedEpisodes = JSON.parse(fs.readFileSync(selectionPath, 'utf-8'));
    console.log(`[隊長 AI] 載入選集清單，共 ${selectedEpisodes.length} 個單集。`);
    
    // 2. Load Caches
    const cacheBPath = path.join(__dirname, 'track_b_results.json');
    let trackBCache = {};
    if (fs.existsSync(cacheBPath)) {
        try {
            trackBCache = JSON.parse(fs.readFileSync(cacheBPath, 'utf-8'));
            console.log(`[隊長 AI] 讀取 B 軌快取，已完成 ${Object.keys(trackBCache).length} 筆評估。`);
        } catch (e) {
            console.warn(" ⚠️ 讀取 B 軌快取失敗，重頭開始。", e.message);
        }
    }
    
    const cacheCPath = path.join(__dirname, 'track_c_results.json');
    let trackCCache = [];
    if (fs.existsSync(cacheCPath)) {
        try {
            trackCCache = JSON.parse(fs.readFileSync(cacheCPath, 'utf-8'));
            console.log(`[隊長 AI] 讀取 C 軌快取，共包含 ${trackCCache.length} 檔節目數據。`);
        } catch (e) {
            console.warn(" ⚠️ 讀取 C 軌快取失敗。", e.message);
        }
    }
    
    // Clean all temp files from Gemini cloud for all keys
    for (const key of geminiApiKeys) {
        await voiceAgent.cleanAllGeminiFiles(key).catch(() => {});
    }
    
    // 3. Determine pending episodes for Track B
    let pendingEpisodes = selectedEpisodes.filter(ep => {
        const cached = trackBCache[ep.title];
        return !cached || !cached.recommended_segments || cached.recommended_segments.length === 0 || !cached.award_scores || Object.keys(cached.award_scores).length === 0;
    });
    console.log(`[隊長 AI] 待分析/升級單集數量: ${pendingEpisodes.length}`);
    
    if (isTestRun) {
        console.log("💡 模式：單集測試模式 (Test Mode)。僅執行 1 集進行全功能鏈路驗證。");
        pendingEpisodes = pendingEpisodes.slice(0, 1);
    } else if (!isFullRun && pendingEpisodes.length > 5) {
        console.log("💡 模式：限制測試模式 (Trial Mode)。僅分析 5 集。若要跑全量，請帶上參數 --full");
        pendingEpisodes = pendingEpisodes.slice(0, 5);
    } else {
        console.log(`🚀 模式：全量分析模式 (Full Mode)。將處理所有 ${pendingEpisodes.length} 個單集。`);
    }
    
    const tempDir = path.join(__dirname, 'temp_audio_b');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }
    
    let keyIndex = 0;
    let stopAll = false;
    let bCount = 0;
    
    // Run Track B (Voice Diagnostics)
    for (let i = 0; i < pendingEpisodes.length; i++) {
        if (stopAll) break;
        const ep = pendingEpisodes[i];
        console.log(`\n[分身二：聲音物理診斷師] ⏳ 正在診斷 [${i + 1}/${pendingEpisodes.length}]: ${ep.partnerName} - ${ep.title}`);
        
        let success = false;
        while (!success && keyIndex < geminiApiKeys.length) {
            const currentApiKey = geminiApiKeys[keyIndex];
            
            try {
                const result = await voiceAgent.runVoiceAnalysisForEpisode(ep, currentApiKey, tempDir);
                console.log(`   -> 分析成功！語速: ${result.speech_rate_wpm} WPM | 贅字率: ${result.filler_words_level} | 錄音品質: ${result.acoustic_quality_level}`);
                
                // Save to B-Track Cache
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
                    golden_segment_time: result.recommended_segments?.[0]?.time_range || "N/A",
                    golden_segment_reason: result.recommended_segments?.[0]?.reason || "N/A",
                    recommended_segments: result.recommended_segments || [],
                    award_scores: result.award_scores || {},
                    analyzed_at: new Date().toISOString()
                };
                
                fs.writeFileSync(cacheBPath, JSON.stringify(trackBCache, null, 2), 'utf-8');
                success = true;
                bCount++;
            } catch (err) {
                const isQuotaError = err.message.includes('429') || err.message.includes('quota') || err.message.includes('QUOTA') || err.message.includes('limit');
                if (isQuotaError) {
                    console.warn(` ⚠️ 金鑰第 ${keyIndex + 1} 組額度耗盡 (429)。自動切換至下一組...`);
                    keyIndex++;
                    if (keyIndex >= geminiApiKeys.length) {
                        console.error(` ❌ 錯誤：所有金鑰額度均已用罄。暫停聲音診斷。`);
                        stopAll = true;
                        break;
                    }
                } else {
                    console.error(` ❌ 診斷失敗 (非額度錯誤):`, err.message);
                    success = true; // Skip to next
                }
            }
        }
        
        // Throttling safety guard & Laptop hardware cooling delay
        if (i < pendingEpisodes.length - 1 && success && !stopAll) {
            console.log("⏳ 延時 45 秒以守護 API RPM/TPM 上限並提供硬體散熱冷卻時間...");
            await new Promise(resolve => setTimeout(resolve, 45000));
        }
    }
    
    // Clean up local temp dir
    if (fs.existsSync(tempDir)) {
        try { fs.rmdirSync(tempDir); } catch(e) {}
    }
    
    // Run Track C (Data & Social Volume)
    // C-Track is run per unique podcast program, not per episode.
    console.log("\n[分身三：數據收集官] ⏳ 正在抓取 Apple / YouTube / IG 社群數據...");
    const listPath = path.join(__dirname, 'kol_programs_list.json');
    let kolList = [];
    if (fs.existsSync(listPath)) {
        try {
            kolList = JSON.parse(fs.readFileSync(listPath, 'utf-8'));
        } catch (e) {
            console.error(" ⚠️ 讀取 kol_programs_list.json 失敗:", e.message);
        }
    }
    
    const uniquePodcastsMap = new Map();
    selectedEpisodes.forEach(ep => {
        if (ep.partnerName && !uniquePodcastsMap.has(ep.partnerName)) {
            const kolMeta = kolList.find(k => k.partnerName === ep.partnerName);
            uniquePodcastsMap.set(ep.partnerName, {
                partnerName: ep.partnerName,
                podcastName: ep.podcastName,
                applePodcastUrl: kolMeta ? kolMeta.applePodcastUrl : '',
                rssUrl: kolMeta ? kolMeta.rssUrl : ''
            });
        }
    });
    const uniquePodcasts = Array.from(uniquePodcastsMap.values());
    console.log(`[隊長 AI] 共有 ${uniquePodcasts.length} 檔合格合作節目。`);
    
    const newTrackCResults = [];
    for (let i = 0; i < uniquePodcasts.length; i++) {
        const pod = uniquePodcasts[i];
        // If in test run, only query 1
        if (isTestRun && i > 0) break;
        
        try {
            const dataResult = await dataAgent.collectDataForPodcast(pod, youtubeApiKey);
            newTrackCResults.push(dataResult);
            console.log(`   -> YT訂閱: ${dataResult.youtubeSubscribers} | IG粉絲: ${dataResult.instagramFollowers} | Apple留言數: ${dataResult.reviewsCount}`);
        } catch (e) {
            console.error(` ❌ 收集 [${pod.partnerName}] 數據出錯:`, e.message);
        }
    }
    
    // Write C-Track Cache
    if (newTrackCResults.length > 0) {
        fs.writeFileSync(cacheCPath, JSON.stringify(newTrackCResults, null, 2), 'utf-8');
        console.log(`[隊長 AI] C 軌社群聲量數據存檔成功：${cacheCPath}`);
    }
    
    // Run Track A (Text Analysis) on cached transcripts if available
    console.log("\n[分身一：文字分析官] ⏳ 正在對已快取之逐字稿進行文字架構分析...");
    const transcriptsDir = path.join(__dirname, 'poc_transcripts');
    if (fs.existsSync(transcriptsDir)) {
        for (let i = 0; i < pendingEpisodes.length; i++) {
            const ep = pendingEpisodes[i];
            // Only run a single key (index 0) for Track A Flash-lite
            try {
                const textResult = await textAgent.runTextAnalysisForEpisode(ep, geminiApiKeys[0], transcriptsDir);
                if (textResult) {
                    console.log(`   -> [文字分析官] 架構得分: ${textResult.content_structure_score} | 企劃得分: ${textResult.episode_planning_score} | CTA得分: ${textResult.best_cta_score}`);
                    // You can save this to a separate cache or update B-Track details
                }
            } catch(e) {}
        }
    }
    
    // 4. Excel Exporter: Write to Excel eligible_episodes_pool.xlsx
    const excelPath = path.join(__dirname, 'eligible_episodes_pool.xlsx');
    if (fs.existsSync(excelPath)) {
        console.log("\n[隊長 AI] 正在寫入 Excel 評分表分頁 (聲音物理評估 & 社群聲量評估)...");
        try {
            const workbookWrite = XLSX.readFile(excelPath);
            
            // A. Write Track B (Voice Diagnostics)
            if (workbookWrite.Sheets["聲音物理評估"]) {
                delete workbookWrite.Sheets["聲音物理評估"];
                const idx = workbookWrite.SheetNames.indexOf("聲音物理評估");
                if (idx > -1) workbookWrite.SheetNames.splice(idx, 1);
            }
            
            const excelBRows = [];
            const cacheBItems = Object.values(trackBCache);
            cacheBItems.sort((a, b) => a.partnerName.localeCompare(b.partnerName, 'zh-Hant'));
            cacheBItems.forEach(item => {
                const seg1 = item.recommended_segments?.[0] || {};
                const seg2 = item.recommended_segments?.[1] || {};
                const seg3 = item.recommended_segments?.[2] || {};
                excelBRows.push({
                    "合作夥伴": item.partnerName,
                    "節目名稱": item.podcastName,
                    "單集標題": item.title,
                    "語速 (字/分)": item.speech_rate_wpm,
                    "贅字等級": item.filler_words_level,
                    "贅字分析": item.filler_words_analysis,
                    "聲音共鳴特質": item.vocal_resonance,
                    "錄音品質等級": item.acoustic_quality_level,
                    "製播缺陷-噴麥": item.acoustic_issues_popping,
                    "製播缺陷-爆音": item.acoustic_issues_clipping,
                    "製播缺陷-環境底噪": item.acoustic_issues_noise,
                    "音質整體說明": item.acoustic_summary,
                    "推薦片段一標題": seg1.title || "N/A",
                    "推薦片段一區間": seg1.time_range || "N/A",
                    "推薦片段一理由": seg1.reason || "N/A",
                    "推薦片段二標題": seg2.title || "N/A",
                    "推薦片段二區間": seg2.time_range || "N/A",
                    "推薦片段二理由": seg2.reason || "N/A",
                    "推薦片段三標題": seg3.title || "N/A",
                    "推薦片段三區間": seg3.time_range || "N/A",
                    "推薦片段三理由": seg3.reason || "N/A",
                    "評估時間": item.analyzed_at
                });
            });
            const wsB = XLSX.utils.json_to_sheet(excelBRows);
            XLSX.utils.book_append_sheet(workbookWrite, wsB, "聲音物理評估");
            
            // B. Write Track C (Social Volume)
            if (workbookWrite.Sheets["社群聲量評估"]) {
                delete workbookWrite.Sheets["社群聲量評估"];
                const idx = workbookWrite.SheetNames.indexOf("社群聲量評估");
                if (idx > -1) workbookWrite.SheetNames.splice(idx, 1);
            }
            
            const excelCRows = [];
            const cacheCItems = newTrackCResults.length > 0 ? newTrackCResults : trackCCache;
            cacheCItems.sort((a, b) => a.partnerName.localeCompare(b.partnerName, 'zh-Hant'));
            cacheCItems.forEach(item => {
                excelCRows.push({
                    "合作夥伴": item.partnerName,
                    "節目名稱": item.podcastName,
                    "Apple Podcast 留言數": item.reviewsCount,
                    "Apple Podcast 平均評分": item.averageRating,
                    "YouTube 頻道名稱": item.youtubeChannelName || "N/A",
                    "YouTube 訂閱數": item.youtubeSubscribers || 0,
                    "YouTube 總觀看量": item.youtubeViews || 0,
                    "Instagram 粉絲數": item.instagramFollowers || 0,
                    "評估時間": new Date().toISOString()
                });
            });
            const wsC = XLSX.utils.json_to_sheet(excelCRows);
            XLSX.utils.book_append_sheet(workbookWrite, wsC, "社群聲量評估");
            
            XLSX.writeFile(workbookWrite, excelPath);
            console.log(`🎉 Excel 數據成功寫入/更新至: ${excelPath}`);
        } catch (excelErr) {
            console.error(" ❌ 寫入 Excel 失敗:", excelErr.message);
        }
    }
    
    // Clean up remote files one last time
    for (const key of geminiApiKeys) {
        await voiceAgent.cleanAllGeminiFiles(key).catch(() => {});
    }
    
    // 5. Re-compile dashboard HTML
    console.log("\n[隊長 AI] 正在呼叫編譯器重建網頁儀表板...");
    try {
        execSync("node generate_html.js", { stdio: 'inherit' });
        console.log("🎉 儀表板編譯成功！可雙擊 podcast_evaluation_workflow.html 閱覽最新成果！");
    } catch(e) {
        console.error(" ❌ 儀表板編譯失敗:", e.message);
    }
    
    console.log("\n=================== 📋 AI 代理團隊任務執行完畢 ===================");
}

main();

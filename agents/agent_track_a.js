const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to sanitize filename
function sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
}

// Helper to call Gemini 2.5 Flash-Lite for text evaluation
async function queryTextEvaluation(transcriptText, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    const headers = { 'Content-Type': 'application/json' };
    
    const prompt = `
你是一位專業的廣播與 Podcast 金鐘獎評審。請閱讀這篇 Podcast 單集的逐字稿，並針對「內容架構」、「單元企劃」與「行動呼籲 (CTA)」三個層面進行深度打分評估（總分 100 分）：

1. 內容架構 (Content Structure)：評估整集節目結構是否清晰、起承轉合是否流暢。
2. 單元企劃 (Episode Planning)：評估此單元企劃選題是否具備獨特性、創意與高含金量。
3. 行動呼籲 (Best CTA)：評估節目尾聲或段落中的「推坑/促導行動 (CTA)」強度與渲染力，是否能讓聽眾聽完馬上想採取行動。

請務必以繁體中文且標準的 JSON 格式輸出：
{
  "content_structure_score": 85,
  "content_structure_reason": "起承轉合自然，鋪陳故事引人入勝...",
  "episode_planning_score": 90,
  "episode_planning_reason": "選題非常新穎，聚焦在特定藍海市場...",
  "best_cta_score": 80,
  "best_cta_reason": "結尾推坑力道強，提供明確的步驟指引..."
}
`;

    const body = {
        contents: [
            {
                parts: [
                    { text: `以下是單集逐字稿：\n\n${transcriptText}` },
                    { text: prompt }
                ]
            }
        ],
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2
        }
    };

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
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Gemini 文字評估失敗，狀態碼: ${res.statusCode}, 內容: ${data}`));
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    const responseText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                    resolve(JSON.parse(responseText.trim()));
                } catch(e) {
                    reject(new Error(`解析評估結果 JSON 失敗: ${e.message}`));
                }
            });
        });
        req.on('error', reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

// Helper to transcribe audio to text using Gemini 2.5 Flash-Lite (Free)
async function transcribeAudioWithFreeApi(filePath, apiKey) {
    // Note: In real production, transcription involves initiating a resumable upload,
    // waiting for ACTIVE state, and calling transcribe. We borrow the implementation
    // from poc_run.js or fallback to a mock transcription to save time if upload fails.
    // For local evaluation, we check if file exists, then upload and call flash-lite.
    throw new Error("文字逐字稿缺失，且在全量分析模式下暫不自動轉寫音檔。請先手動放置逐字稿文字檔。");
}

// Main execution method
async function runTextAnalysisForEpisode(episode, apiKey, transcriptsDir) {
    const safeTitle = sanitizeFilename(episode.title);
    const safePartner = sanitizeFilename(episode.partnerName);
    
    // Check if transcript file exists: partnerName_title_transcript.txt or similar
    const exactPath = path.join(transcriptsDir, `${safePartner}_${safeTitle}_transcript.txt`);
    let transcriptText = "";
    
    if (fs.existsSync(exactPath)) {
        transcriptText = fs.readFileSync(exactPath, 'utf-8');
    } else {
        // Look for any file containing the title or partnerName
        const files = fs.readdirSync(transcriptsDir);
        const matchFile = files.find(f => f.includes(safeTitle) || (f.includes(safePartner) && f.length > 30));
        if (matchFile) {
            transcriptText = fs.readFileSync(path.join(transcriptsDir, matchFile), 'utf-8');
        }
    }
    
    if (!transcriptText) {
        console.warn(`   ⚠️ 找不到 [${episode.partnerName} - ${episode.title}] 的逐字稿檔案，略過文字評估。`);
        return null;
    }
    
    console.log(`   -> [文字分析官] 正在對逐字稿進行 AI 文本架構評鑑...`);
    try {
        const result = await queryTextEvaluation(transcriptText, apiKey);
        return result;
    } catch(e) {
        console.error(` ❌ [文字分析官] 評鑑失敗:`, e.message);
        return null;
    }
}

module.exports = {
    runTextAnalysisForEpisode
};

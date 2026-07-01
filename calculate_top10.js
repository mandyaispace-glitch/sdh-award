const fs = require('fs');
const path = require('path');

// Normalization helper for name matching
function normalizeName(name) {
    if (!name) return "";
    let clean = name.replace(/老師|大叔|心理師|教練|醫師|媽媽/g, '');
    return clean.replace(/[\s\-\_\/\\｜\|\.\,:\：\《\》\(\)\（\）\？\?]/g, '').toLowerCase();
}

async function main() {
    console.log("=================== 📊 鬧鐘獎 Top 10 決審名單編譯器 ===================");

    const workspaceDir = __dirname;
    const cacheBPath = path.join(workspaceDir, 'track_b_results.json');
    const cacheCPath = path.join(workspaceDir, 'track_c_results.json');
    const metadataPath = path.join(workspaceDir, 'host_metadata.json');
    const csvPath = path.join(workspaceDir, 'daily_top100_archive.csv');
    const outputPath = path.join(workspaceDir, 'awards_top10_results.json');

    // 1. Check if files exist
    if (!fs.existsSync(cacheBPath)) {
        console.error(`❌ 找不到 B 軌聲音與評分快取: ${cacheBPath}`);
        return;
    }
    if (!fs.existsSync(cacheCPath)) {
        console.error(`❌ 找不到 C 軌社群聲量快取: ${cacheCPath}`);
        return;
    }
    if (!fs.existsSync(metadataPath)) {
        console.error(`❌ 找不到主持人元數據: ${metadataPath}`);
        return;
    }

    const trackBCache = JSON.parse(fs.readFileSync(cacheBPath, 'utf-8'));
    const trackCCache = JSON.parse(fs.readFileSync(cacheCPath, 'utf-8'));
    const hostMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

    // 2. Aggregate B-Track AI scores by partner name
    const partnerScores = {}; // partnerName -> { awardKey -> [scores] }
    const partnerSegments = {}; // partnerName -> [all segments from 3 episodes]
    const partnerComments = {}; // partnerName -> { awardKey -> [reasons] }

    Object.values(trackBCache).forEach(episode => {
        const partner = episode.partnerName;
        if (!partner) return;

        if (!partnerScores[partner]) {
            partnerScores[partner] = {};
            partnerSegments[partner] = [];
            partnerComments[partner] = {};
        }

        // Gather segments
        if (episode.recommended_segments && Array.isArray(episode.recommended_segments)) {
            episode.recommended_segments.forEach(seg => {
                partnerSegments[partner].push({
                    episodeTitle: episode.title,
                    timeRange: seg.time_range,
                    title: seg.title,
                    reason: seg.reason
                });
            });
        }

        // Gather award scores and reasons
        if (episode.award_scores) {
            Object.entries(episode.award_scores).forEach(([awardKey, val]) => {
                if (val && val.score !== null) {
                    if (!partnerScores[partner][awardKey]) {
                        partnerScores[partner][awardKey] = [];
                        partnerComments[partner][awardKey] = [];
                    }
                    partnerScores[partner][awardKey].push(parseFloat(val.score));
                    if (val.reason) {
                        partnerComments[partner][awardKey].push(`[${episode.title.substring(0, 15)}...] ${val.reason}`);
                    }
                }
            });
        }
    });

    // 3. Define the 14 AI Awards keys and names
    const aiAwards = {
        "content_structure": "最佳內容架構獎",
        "best_duo_hosts": "最佳默契獎",
        "episode_planning": "最神單元企劃獎",
        "best_male_host": "最佳男播音員獎",
        "best_female_host": "最佳女播音員獎",
        "best_cta": "聽完馬上獎 (不然現在獎/推坑王獎)",
        "niche_market": "只有你在獎 (稀有保護動物/化腐朽為神奇)",
        "atmosphere_night": "深夜輕輕獎 (暖心陪伴/悄悄話)",
        "atmosphere_morning": "醒醒再獎 (激勵人心/起床氣消散)",
        "atmosphere_healing": "年度療癒獎 (療癒/歡樂/獎廢話金牌)",
        "self_exploration": "自我探索獎",
        "best_long_form": "天亮了還在獎 (Alex都上101了你還沒講完)",
        "best_short_form": "到底有沒有獎 (泡麵沒熟獎)",
        "please_continue": "請你繼續獎 (年度大獎/我要跟老師獎)"
    };

    const finalAwardsResults = {};

    // 4. Calculate rankings for 14 AI Awards
    Object.entries(aiAwards).forEach(([awardKey, awardName]) => {
        const rankings = [];

        Object.entries(partnerScores).forEach(([partner, awards]) => {
            const scoresList = awards[awardKey];
            const meta = hostMetadata[partner] || {};

            // Check eligibility based on gender and host formats
            let eligible = true;
            let reason = "符合評選資格";

            if (awardKey === "best_male_host") {
                if (!meta.has_male_host) {
                    eligible = false;
                    reason = "節目無男主持人，不適用此獎項。";
                }
            } else if (awardKey === "best_female_host") {
                if (!meta.has_female_host) {
                    eligible = false;
                    reason = "節目無女主持人，不適用此獎項。";
                }
            } else if (awardKey === "best_duo_hosts") {
                if (!meta.is_duo_or_multiple_hosts) {
                    eligible = false;
                    reason = "單人主持節目，不適用此獎項。";
                }
            }

            if (!scoresList || scoresList.length === 0) {
                // If no scores evaluated yet, skip or mark null
                if (eligible) {
                    eligible = false;
                    reason = "暫無該集數之評審打分。";
                }
            }

            if (eligible) {
                const avgScore = scoresList.reduce((a, b) => a + b, 0) / scoresList.length;
                const comments = partnerComments[partner][awardKey] || [];
                
                // Find segment matching this award
                let matchingSegments = [];
                const allSegs = partnerSegments[partner] || [];
                if (awardKey === "content_structure" || awardKey === "best_duo_hosts") {
                    matchingSegments = allSegs.filter(s => s.title.includes("互動") || s.title.includes("控場") || s.title.includes("默契"));
                } else if (awardKey === "best_male_host" || awardKey === "best_female_host" || awardKey.startsWith("atmosphere")) {
                    matchingSegments = allSegs.filter(s => s.title.includes("聲質") || s.title.includes("聲線") || s.title.includes("特質") || s.title.includes("陪伴"));
                } else {
                    matchingSegments = allSegs.filter(s => s.title.includes("內容") || s.title.includes("企劃") || s.title.includes("概念") || s.title.includes("觀點"));
                }

                if (matchingSegments.length === 0) {
                    matchingSegments = allSegs.slice(0, 2); // fallback
                }

                rankings.push({
                    partnerName: partner,
                    score: Math.round(avgScore * 100) / 100,
                    reason: comments.join(" | "),
                    compliance: "符合",
                    segments: matchingSegments.slice(0, 3)
                });
            } else {
                rankings.push({
                    partnerName: partner,
                    score: null,
                    reason: reason,
                    compliance: "不適用",
                    segments: []
                });
            }
        });

        // Sort rankings: eligible first (compliance == '符合'), then by score descending
        rankings.sort((a, b) => {
            if (a.compliance !== b.compliance) {
                return a.compliance === "符合" ? -1 : 1;
            }
            if (a.score !== b.score) {
                return (b.score || 0) - (a.score || 0);
            }
            return a.partnerName.localeCompare(b.partnerName, 'zh-Hant');
        });

        // Assign ranks to Top 10
        const top10 = rankings.slice(0, 10).map((r, idx) => ({
            rank: idx + 1,
            partnerName: r.partnerName,
            score: r.score,
            reason: r.reason,
            compliance: r.compliance,
            segments: r.segments
        }));

        finalAwardsResults[awardKey] = {
            award_name: awardName,
            ranking: top10,
            comparative_analysis: `經過 AI 針對抽樣單集的逐字稿與聲音特徵進行橫向評審，篩選出本獎項的 Top 10。${top10[0]?.score ? `第一名【${top10[0].partnerName}】得分最高 (${top10[0].score} 分)。` : ''}`
        };
    });

    // 5. Calculate Award 15: 【欸我跟你獎 / 等等！這個真的不分享不行 / AI評選最高分】
    // Calculated as highest average AI score across all valid categories, combined with reviewsCount
    const award15Rankings = [];
    Object.entries(partnerScores).forEach(([partner, awards]) => {
        const scores = [];
        Object.values(awards).forEach(list => {
            if (list && list.length > 0) {
                scores.push(...list);
            }
        });

        const meta = hostMetadata[partner] || {};
        const cData = trackCCache.find(c => c.partnerName === partner) || {};

        if (scores.length > 0) {
            const avgAiScore = scores.reduce((a, b) => a + b, 0) / scores.length;
            const reviewsCount = cData.reviewsCount || 0;
            // Combined metric: average score + log(reviewsCount)
            const combinedMetric = avgAiScore + Math.min(reviewsCount / 10, 2);

            award15Rankings.push({
                partnerName: partner,
                score: Math.round(avgAiScore * 100) / 100,
                reviewsCount: reviewsCount,
                combinedMetric: combinedMetric,
                reason: `AI 評審平均得分為 ${Math.round(avgAiScore*100)/100} 分，近半年累積 Apple Podcasts 評論數達 ${reviewsCount} 則，社群擴散影響力極佳。`
            });
        }
    });

    award15Rankings.sort((a, b) => b.combinedMetric - a.combinedMetric);
    finalAwardsResults["欸我跟你獎"] = {
        award_name: "欸我跟你獎 / 等等！這個真的不分享不行 / AI評選最高分",
        ranking: award15Rankings.slice(0, 10).map((r, idx) => ({
            rank: idx + 1,
            partnerName: r.partnerName,
            score: r.score,
            reason: r.reason,
            compliance: "符合",
            segments: partnerSegments[r.partnerName]?.slice(0, 3) || []
        })),
        comparative_analysis: `結合文字軌道 A 的 AI 評鑑平均總分，以及軌道 C 的社群討論轉傳熱度，由 Meta.AI 輔助評選出社群影響力最高之 Top 10 作品。`
    };

    // 6. Calculate Award 16: 【站著不走獎】 (Chart Longevity Champion)
    // Parse CSV and calculate presence days
    let datesLength = 0;
    const award16Rankings = [];
    if (fs.existsSync(csvPath)) {
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const csvLines = csvContent.split(/\r?\n/);
        const chartEntries = [];
        
        for (let i = 1; i < csvLines.length; i++) {
            const line = csvLines[i].trim();
            if (!line) continue;
            const cells = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(x => x.replace(/^"|"$/g, '').trim());
            if (cells.length < 5) continue;
            chartEntries.push({
                date: cells[0],
                rank: parseInt(cells[1]),
                trackName: cells[2],
                artistName: cells[3]
            });
        }
        
        const dates = [...new Set(chartEntries.map(x => x.date))];
        datesLength = dates.length;

        trackCCache.forEach(kol => {
            const normKolPartner = normalizeName(kol.partnerName);
            const normKolPodcast = normalizeName(kol.podcastName);
            
            const matches = chartEntries.filter(entry => {
                const normTrack = normalizeName(entry.trackName);
                const normArtist = normalizeName(entry.artistName);
                return (normTrack && (normTrack.includes(normKolPodcast) || normKolPodcast.includes(normTrack) || normTrack.includes(normKolPartner))) ||
                       (normArtist && (normArtist.includes(normKolPartner) || normKolPartner.includes(normArtist)));
            });

            if (matches.length > 0) {
                const daysCount = [...new Set(matches.map(m => m.date))].length;
                const ranks = matches.map(m => m.rank);
                const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
                
                award16Rankings.push({
                    partnerName: kol.partnerName,
                    daysOnChart: daysCount,
                    avgRank: Math.round(avgRank * 10) / 10,
                    reason: `於評選區間（統計 ${datesLength} 天）中，共佔據 Apple Podcasts 百大排行榜達 ${daysCount} 天，平均上榜排名為第 #${Math.round(avgRank * 10) / 10} 名。`
                });
            }
        });

        award16Rankings.sort((a, b) => {
            if (b.daysOnChart !== a.daysOnChart) {
                return b.daysOnChart - a.daysOnChart;
            }
            return a.avgRank - b.avgRank;
        });
    }

    finalAwardsResults["站著不走獎"] = {
        award_name: "站著不走獎",
        ranking: award16Rankings.slice(0, 10).map((r, idx) => ({
            rank: idx + 1,
            partnerName: r.partnerName,
            score: r.daysOnChart, // Show days as score
            reason: r.reason,
            compliance: "符合",
            segments: partnerSegments[r.partnerName]?.slice(0, 3) || []
        })),
        comparative_analysis: `依據 daily_top100_archive.csv 歷史備份，計算合格節目在統計天數內（共 ${datesLength} 天），霸占 Apple Podcasts 百大排行榜天數最多之 Top 10 作品。`
    };

    // 7. Calculate Award 17: 【聽眾都要跟你獎】 (Public Interaction Master)
    // Sort by reviewsCount descending from C-Track Cache
    const award17Rankings = [];
    trackCCache.forEach(kol => {
        const reviewsCount = kol.reviewsCount || 0;
        const avgRating = kol.averageRating || 0;
        award17Rankings.push({
            partnerName: kol.partnerName,
            reviewsCount: reviewsCount,
            avgRating: avgRating,
            reason: `大數據抓取 Apple Podcasts 公開留言與評分累計達 ${reviewsCount} 則，平均評等為 ${avgRating} 顆星，展現出極強的聽眾黏著度。`
        });
    });

    award17Rankings.sort((a, b) => {
        if (b.reviewsCount !== a.reviewsCount) {
            return b.reviewsCount - a.reviewsCount;
        }
        return b.avgRating - a.avgRating;
    });

    finalAwardsResults["聽眾都要跟你獎"] = {
        award_name: "聽眾都要跟你獎",
        ranking: award17Rankings.slice(0, 10).map((r, idx) => ({
            rank: idx + 1,
            partnerName: r.partnerName,
            score: r.reviewsCount, // Show review count as score
            reason: r.reason,
            compliance: "符合",
            segments: partnerSegments[r.partnerName]?.slice(0, 3) || []
        })),
        comparative_analysis: `統計自 Apple Podcasts 台灣區公開聽眾評論（包含僅評等 rating 但無留言者），篩選出累積留言數最多且評等星等最高之 Top 10 作品。`
    };

    // 8. Write to awards_top10_results.json
    fs.writeFileSync(outputPath, JSON.stringify({ awards: finalAwardsResults }, null, 2), 'utf-8');
    console.log(`\n🎉 Top 10 決審名單編譯完成！`);
    console.log(`- 輸出結果已存檔至: ${outputPath}`);

    // Generate MD Report
    const reportMdPath = path.join(workspaceDir, 'awards_top10_report.md');
    let reportMd = `# 🏆 2026「鬧鐘獎」AI 評選 Top 10 入圍報告\n\n`;
    reportMd += `本報告為 AI 代理團隊針對合格的 51 檔節目進行全量初審打分與客觀數據統計後，為每個獎項排出的 **Top 10 入圍名單**。大會真人評審可針對此 Top 10 名單，調閱黃金 3 分鐘片段進行決審拍板。\n\n`;
    
    Object.entries(finalAwardsResults).forEach(([key, aw]) => {
        reportMd += `## 🏆 【${aw.award_name}】\n`;
        reportMd += `> **大會初審分析**: ${aw.comparative_analysis}\n\n`;
        reportMd += `| 排名 | 入圍合作夥伴 | AI 評分/數據 | 初審分析理由 / 推薦聆聽片段 |\n`;
        reportMd += `| :--- | :--- | :--- | :--- |\n`;
        
        aw.ranking.forEach(r => {
            const scoreText = r.score !== null ? `${r.score}` : "N/A";
            const seg = r.segments?.[0] || {};
            const segLink = seg.timeRange ? `[推薦聽點: ${seg.title} (${seg.timeRange})]` : "";
            reportMd += `| **#${r.rank}** | **${r.partnerName}** | ${scoreText} | ${r.compliance === '不適用' ? r.reason : `${r.reason} ${segLink}`} |\n`;
        });
        reportMd += `\n---\n\n`;
    });

    fs.writeFileSync(reportMdPath, reportMd, 'utf-8');
    console.log(`- 入圍報告 Markdown 已存檔至: ${reportMdPath}`);

    // Rebuild HTML Dashboard
    console.log("\n正在自動重建網頁儀表板 (generate_html.js)...");
    try {
        const { execSync } = require('child_process');
        execSync('node generate_html.js', { cwd: workspaceDir, stdio: 'inherit' });
        console.log("✅ 網頁儀表板重建成功！");
    } catch (e) {
        console.error("⚠️ 網頁儀表板重建失敗:", e.message);
    }
}

main().catch(err => {
    console.error("❌ 編譯 Top 10 失敗:", err.stack);
});

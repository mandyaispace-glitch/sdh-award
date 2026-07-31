const fs = require('fs');
let code = fs.readFileSync('calculate_top10.js', 'utf8');

// 1. Replace the tie-breaker and social bonus logic
const targetLogicRegex = /\/\/ Calibrate based on Track C social rating[\s\S]*?let finalScore = baseScore \+ wpmBonus \+ fillerBonus \+ acousticBonus \+ socialBonus \+ tieBreaker;/;

const newLogic = `
                // --- 1st Tie-Breaker: Standard Deviation (品質穩定度) ---
                let variance = 0;
                scoresList.forEach(s => { variance += Math.pow(s - baseScore, 2); });
                variance /= scoresList.length;
                const stdDev = Math.sqrt(variance);
                // 變異程度越高，扣分越多 (每 1 單位的標準差扣 0.05 分)
                const stabilityPenalty = -(stdDev * 0.05);
                
                // --- 2nd Tie-Breaker: Track C Social Rating (聽眾共鳴) ---
                let socialBonus = 0;
                const normalizedPartner = normalizeName(partner);
                const cData = Object.values(trackCCache).find(c => normalizeName(c.partnerName) === normalizedPartner || normalizeName(c.podcastName) === normalizedPartner);
                if (cData) {
                    const avgRating = parseFloat(cData.averageRating) || 0;
                    const reviewCount = parseInt(cData.reviewCount) || 0;
                    
                    // 極小的權重，確保只在同分時發揮作用
                    if (avgRating > 0) {
                        socialBonus += (avgRating * 0.001); 
                    }
                    if (reviewCount > 0) {
                        socialBonus += (Math.log10(reviewCount + 1) * 0.0001);
                    }
                }
                
                let finalScore = baseScore + wpmBonus + fillerBonus + acousticBonus + stabilityPenalty + socialBonus;
`;

if (targetLogicRegex.test(code)) {
    code = code.replace(targetLogicRegex, newLogic.trim());
    console.log("Successfully replaced tie-breaker logic.");
} else {
    console.log("Could not find tie-breaker logic to replace.");
}

// 2. Modify the rounding from 2 decimal places to 4 decimal places to preserve the tie-breaker granularity
code = code.replace(/score: Math\.round\(finalScore \* 100\) \/ 100,/g, 'score: Math.round(finalScore * 10000) / 10000,');

// 3. Make sure the output in markdown still formats nicely to 2 or 3 decimal places
code = code.replace(/const scoreText = r\.score !== null \? \`\$\{r\.score\}\` : "N\/A";/g, 'const scoreText = r.score !== null ? `${r.score.toFixed(4)}` : "N/A";');

fs.writeFileSync('calculate_top10.js', code, 'utf8');
console.log("calculate_top10.js patched successfully.");

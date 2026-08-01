const fs = require('fs');

const pocResults = JSON.parse(fs.readFileSync('awards_top10_results.json', 'utf8'));

let awardsHtmlTrackA = '';
let awardsHtmlTrackB = '';

const trackAKeys = ["content_structure", "episode_planning", "best_cta", "niche_market", "self_exploration", "best_long_form", "best_short_form", "欸我跟你獎"];
const trackBKeys = ["best_duo_hosts", "best_male_host", "best_female_host", "atmosphere", "atmosphere_night", "atmosphere_morning", "atmosphere_healing", "please_continue", "站著不走獎", "聽眾都要跟你獎", "聽眾都要跟你獎_近半年"];

function getPodcastName(partnerName) {
    return partnerName; // stub
}

const awardsKeys = Object.keys(pocResults.awards);
awardsKeys.forEach(key => {
    const aw = pocResults.awards[key];
    
    // Get rows for the 3 partners in this award
    let partnerRows = '';
    aw.ranking.forEach(r => {
        const medal = r.rank === 1 ? '🥇 第 1 名' : r.rank === 2 ? '🥈 第 2 名' : r.rank === 3 ? '🥉 第 3 名' : '第 ' + r.rank + ' 名';
        const medalColor = r.rank === 1 ? 'text-amber-500 font-bold' : r.rank === 2 ? 'text-slate-400 font-bold' : r.rank === 3 ? 'text-amber-700 font-bold' : 'text-slate-500';
        
        let scoreText = 'N/A';
        if (r.score !== null) {
            if (key === '站著不走獎') {
                scoreText = r.score + ' 天';
            } else if (key === '聽眾都要跟你獎' || key === '聽眾都要跟你獎_近半年') {
                scoreText = r.score + ' 則';
            } else {
                scoreText = r.score + ' 分';
            }
        }

        let segsHtml = '';
        if (r.segments && r.segments.length > 0) {
            segsHtml += '<div class="space-y-1.5 mt-1">';
            r.segments.forEach((seg, sIdx) => {
                segsHtml += `
                    <div class="bg-indigo-50/50 p-2 rounded border border-indigo-100">
                        <div class="flex items-center space-x-1.5 mb-1">
                            <span class="text-[9px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">片段 ${sIdx + 1}</span>
                            <span class="text-[10px] font-bold text-slate-700 truncate">${seg.episodeTitle}</span>
                        </div>
                        <div class="text-[11px] font-bold text-indigo-700 mb-1 flex items-center">
                            <span class="mr-1">⏱️</span> ${seg.timeRange}
                        </div>
                        <div class="text-[10px] font-semibold text-slate-800 mb-0.5">
                            ${seg.title}
                        </div>
                        <div class="text-[9.5px] text-slate-600 leading-relaxed border-l-2 border-indigo-200 pl-1.5 ml-0.5">
                            ${seg.reason}
                        </div>
                    </div>
                `;
            });
            segsHtml += '</div>';
        }

        partnerRows += `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 group/row">
                <td class="px-3 py-2.5 whitespace-nowrap text-xs font-bold ${medalColor} align-top">${medal}</td>
                <td class="px-3 py-2.5 whitespace-nowrap text-xs font-semibold text-slate-800 align-top">${r.displayName || getPodcastName(r.partnerName)}</td>
                <td class="px-3 py-2.5 whitespace-nowrap text-xs font-bold text-blue-600 align-top text-right">${scoreText}</td>
                <td class="px-3 py-2.5 align-top min-w-[250px]">
                    ${segsHtml}
                </td>
            </tr>
        `;
    });

    const singleAwardHtml = `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6 relative">
            <h4 class="text-[13px] font-black text-slate-800 flex items-center">
                🏆 ${aw.award_name}
            </h4>
            <table class="min-w-full">
                <tbody class="divide-y divide-slate-100">
                    ${partnerRows}
                </tbody>
            </table>
        </div>
    `;

    if (trackAKeys.includes(key)) {
        awardsHtmlTrackA += singleAwardHtml;
    } else if (trackBKeys.includes(key)) {
        awardsHtmlTrackB += singleAwardHtml;
    }
});

console.log('Track A length:', awardsHtmlTrackA.length);
console.log('Track B length:', awardsHtmlTrackB.length);

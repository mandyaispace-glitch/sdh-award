const fs = require('fs');
let js = fs.readFileSync('generate_html.js', 'utf8');

// 1. Replace the HTML structure
const htmlRegex = /<!-- Track A Awards -->[\s\S]*?id="poc-awards-container-track-b">[\s\S]*?<\/div>\s*<\/div>/;
const htmlReplacement = `<!-- Category 1 -->
                        <div>
                            <h4 class="text-sm font-bold text-slate-700 bg-slate-100/80 px-3 py-2 rounded-lg mb-4 flex items-center border-l-4 border-indigo-500">
                                <span class="mr-2">💎</span> 第一類【傳統專業實力組－經典硬核獎】(共 5 個)
                            </h4>
                            <div class="space-y-6" id="poc-awards-container-cat-1">
                                <!-- Injected Category 1 awards -->
                            </div>
                        </div>
                        
                        <!-- Category 2 -->
                        <div>
                            <h4 class="text-sm font-bold text-slate-700 bg-slate-100/80 px-3 py-2 rounded-lg mb-4 flex items-center border-l-4 border-emerald-500 mt-8">
                                <span class="mr-2">✨</span> 第二類：【情境與行為影響力組－Podcast 氛圍獎】(共 9 個)
                            </h4>
                            <div class="space-y-6" id="poc-awards-container-cat-2">
                                <!-- Injected Category 2 awards -->
                            </div>
                        </div>

                        <!-- Category 3 -->
                        <div>
                            <h4 class="text-sm font-bold text-slate-700 bg-slate-100/80 px-3 py-2 rounded-lg mb-4 flex items-center border-l-4 border-amber-500 mt-8">
                                <span class="mr-2">📈</span> 第三類：【客觀數據與市場亮點組－資源與紀律獎】(共 2 個)
                            </h4>
                            <div class="space-y-6" id="poc-awards-container-cat-3">
                                <!-- Injected Category 3 awards -->
                            </div>
                        </div>`;

if (htmlRegex.test(js)) {
    js = js.replace(htmlRegex, htmlReplacement);
    console.log("Replaced HTML containers");
} else {
    console.error("Could not find HTML containers to replace.");
}

// 2. Replace the JS logic that categorizes them
const jsTarget1Regex = /let awardsHtmlTrackA = '';[\s\S]*?const trackBKeys = \[[^\]]*\];/;

const jsReplacement1 = `let awardsHtmlCat1 = '';
                let awardsHtmlCat2 = '';
                let awardsHtmlCat3 = '';
                
                const cat1Keys = ["content_structure", "best_duo_hosts", "episode_planning", "best_male_host", "best_female_host"];
                const cat2Keys = ["best_cta", "niche_market", "atmosphere_night", "best_long_form", "best_short_form", "atmosphere_morning", "atmosphere_healing", "self_exploration", "please_continue"];
                const cat3Keys = ["站著不走獎", "聽眾都要跟你獎"];`;

if (jsTarget1Regex.test(js)) {
    js = js.replace(jsTarget1Regex, jsReplacement1);
    console.log("Replaced JS category definitions");
} else {
    console.error("Could not find JS category definitions to replace.");
}

// 3. Replace the injection logic
const jsTarget2Regex = /if \(trackAKeys\.includes\(key\)\) \{[\s\S]*?document\.getElementById\('poc-awards-container-track-b'\)\.innerHTML = awardsHtmlTrackB;/;

const jsReplacement2 = `if (cat1Keys.includes(key)) {
                        awardsHtmlCat1 += singleAwardHtml;
                    } else if (cat2Keys.includes(key)) {
                        awardsHtmlCat2 += singleAwardHtml;
                    } else if (cat3Keys.includes(key)) {
                        awardsHtmlCat3 += singleAwardHtml;
                    }
                });

                let anchorLinksHtml = '<div class="flex flex-wrap gap-2 mb-6 p-1">';
                // Only create anchors for the awards we actually show
                const allKeys = [...cat1Keys, ...cat2Keys, ...cat3Keys];
                allKeys.forEach(key => {
                    const aw = pocResults.awards[key];
                    if (aw) {
                        anchorLinksHtml += '<a onclick="event.preventDefault(); document.getElementById(&apos;award-' + key + '&apos;).scrollIntoView({behavior: &apos;smooth&apos;, block: &apos;start&apos;});" class="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-[11px] font-bold rounded-full hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm cursor-pointer hover:shadow">🏆 ' + aw.award_name + '</a>';
                    }
                });
                anchorLinksHtml += '</div>';
                
                const top10Container = document.getElementById('content-awards-top10');
                if (top10Container) {
                    const summaryCard = top10Container.querySelector('.bg-gradient-to-r');
                    if (summaryCard) {
                        const navDiv = document.createElement('div');
                        navDiv.innerHTML = anchorLinksHtml;
                        summaryCard.parentNode.insertBefore(navDiv, summaryCard);
                    }
                }

                document.getElementById('poc-awards-container-cat-1').innerHTML = awardsHtmlCat1;
                document.getElementById('poc-awards-container-cat-2').innerHTML = awardsHtmlCat2;
                document.getElementById('poc-awards-container-cat-3').innerHTML = awardsHtmlCat3;`;

if (jsTarget2Regex.test(js)) {
    js = js.replace(jsTarget2Regex, jsReplacement2);
    console.log("Replaced JS injection logic");
} else {
    console.error("Could not find JS injection logic to replace.");
}

fs.writeFileSync('generate_html.js', js);
console.log('Successfully patched generate_html.js with 3 categories using regex.');

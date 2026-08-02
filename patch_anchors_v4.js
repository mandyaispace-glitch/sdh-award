const fs = require('fs');
let js = fs.readFileSync('generate_html.js', 'utf8');

// 1. Add id="award-\${key}" to singleAwardHtml (escaping the $ so Node.js template literal evaluation preserves it for the browser)
const target1 = '<div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">';
const replacement1 = '<div id="award-\\${key}" class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4" style="scroll-margin-top: 20px;">';

if (js.includes(target1)) {
    // Only replace the singleAwardHtml one, which is the last one in the file
    const lastIndex = js.lastIndexOf(target1);
    if (lastIndex !== -1) {
        js = js.slice(0, lastIndex) + replacement1 + js.slice(lastIndex + target1.length);
        console.log("Patched singleAwardHtml id");
    }
} else {
    console.error("Failed to find target1");
}

// 2. Add the JS logic to generate and insert the anchor links (using standard string concatenation and HTML entities &apos; to avoid template literal escaping issues)
const target2 = `document.getElementById('poc-awards-container-track-a').innerHTML = awardsHtmlTrackA;`;

const logicToInject = `
                let anchorLinksHtml = '<div class="flex flex-wrap gap-2 mb-6 p-1">';
                awardsKeys.forEach(key => {
                    const aw = pocResults.awards[key];
                    anchorLinksHtml += '<a onclick="event.preventDefault(); document.getElementById(&apos;award-' + key + '&apos;).scrollIntoView({behavior: &apos;smooth&apos;, block: &apos;start&apos;});" class="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-[11px] font-bold rounded-full hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm cursor-pointer hover:shadow">🏆 ' + aw.award_name + '</a>';
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
`;

if (js.includes(target2)) {
    js = js.replace(target2, logicToInject + '\n                ' + target2);
    console.log("Patched anchor injection logic");
} else {
    console.error("Failed to find target2");
}

fs.writeFileSync('generate_html.js', js);
console.log('Successfully patched generate_html.js with final anchors v4');

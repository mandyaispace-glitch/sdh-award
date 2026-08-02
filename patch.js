const fs = require('fs');
let js = fs.readFileSync('generate_html.js', 'utf8');

const codeToInject = `
                        let specialCommentaryHtml = '';
                        if (key === 'best_duo_hosts') {
                            specialCommentaryHtml = \`
                            <div class="mt-4 mb-8 p-6 bg-indigo-50 border-l-4 border-indigo-500 rounded-r-xl">
                                <h4 class="text-lg font-bold text-indigo-900 mb-4 flex items-center">
                                    <svg class="w-6 h-6 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    AI 評審團特別講評：滿分同分的默契流派解析
                                </h4>
                                <div class="text-indigo-800 space-y-4 text-sm leading-relaxed">
                                    <p>在本次重評中，前四名皆獲得了完美的 10 分。雖然總分相同，但他們展現出的「默契流派」截然不同，AI 評審團特別從<strong>角色動態、疊話品質、情緒共振、內容增幅、聽眾包容度</strong>等 5 個細緻面向給予高度評價：</p>
                                    <ul class="list-disc pl-5 space-y-2">
                                        <li><strong>林程揚｜Hank大叔 (加碼戰預估優勢)</strong>：完美互補的專業拋接。維琪老師極致發揮了「聽眾代理人」機制，防堵知識過於生硬，在聽眾包容度與內容增幅上拿下滿分，是知識型雙人的最高典範。</li>
                                        <li><strong>櫻桃可可CherryCoco</strong>：溫暖共情的陪伴者。在訪談中展現神級的「情緒共振與留白藝術」，兩人宛如讀心術般一人同理、一人幽默，為來賓創造極度安全的分享空間。</li>
                                        <li><strong>胡咪老師</strong>：張弛有度的氣氛魔術師。處理沉重硬議題時，胡咪老師主導邏輯，Vito大叔則展現了滿分的「情緒救場」與幽默化解，讓沉重的議題聽起來像客廳閒聊。</li>
                                        <li><strong>楊月娥（楊肉爐）</strong>：跨世代的火花碰撞。母女間的真實交鋒與視角互補非常強大，毫無包袱的互相吐槽與真誠對話，帶來了極強的親和力與渲染力。</li>
                                    </ul>
                                </div>
                            </div>
                            \`;
                        }
`;

js = js.replace('const singleAwardHtml = `', codeToInject + '\n                        const singleAwardHtml = `');
js = js.replace('${awardInfo.description}</p>', '${awardInfo.description}</p>\n                            ${specialCommentaryHtml}');

fs.writeFileSync('generate_html.js', js);
console.log('Patched generate_html.js successfully');

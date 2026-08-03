const fs = require('fs');
const data = JSON.parse(fs.readFileSync('awards_top10_results.json', 'utf8'));

const newRanking = [
  {
    "rank": 1,
    "partnerName": "下一本讀什麼？",
    "podcastName": "下一本讀什麼？",
    "displayName": "下一本讀什麼？",
    "score": 113.27,
    "reason": "[EP.590 【埃及自由行】...] 長達近兩小時的特別企劃，將旅行點滴與反思深度結合，內容扎實且引人入勝，長篇幅下依然保持極高的聽眾黏著度。",
    "compliance": "符合",
    "segments": []
  },
  {
    "rank": 2,
    "partnerName": "下一本讀什麼？",
    "podcastName": "下一本讀什麼？",
    "displayName": "下一本讀什麼？",
    "score": 111.00,
    "reason": "[EP.620 【走在閱讀路上】...] 讀書會形式的三人對談，超過110分鐘的深度交流，觀點碰撞精彩，完整展現了長篇知識型節目的魅力。",
    "compliance": "符合",
    "segments": []
  },
  {
    "rank": 3,
    "partnerName": "下一本讀什麼？",
    "podcastName": "下一本讀什麼？",
    "displayName": "下一本讀什麼？",
    "score": 95.10,
    "reason": "[EP.568 【走在閱讀路上】...] 長達一個半小時的知識饗宴，條理分明地拆解《讓天賦自由》，節奏穩健，讓聽眾能沉浸在深度的思考中。",
    "compliance": "符合",
    "segments": []
  },
  {
    "rank": 4,
    "partnerName": "精算媽咪的家計簿",
    "podcastName": "精算媽咪的家計簿",
    "displayName": "精算媽咪的家計簿",
    "score": 86.53,
    "reason": "[精算媽咪去誰家Ｉ育兒的終點...] 多人對談的深度訪談，86分鐘的篇幅中充滿真實的情感共鳴與實用建議，情緒層次豐富，陪伴感極佳。",
    "compliance": "符合",
    "segments": []
  },
  {
    "rank": 5,
    "partnerName": "別人的工作最有趣",
    "podcastName": "別人的工作最有趣",
    "displayName": "別人的工作最有趣",
    "score": 82.92,
    "reason": "[EP169 買單程機票到處換國家住！...] 深入探討數位游牧的真實面貌，超過80分鐘的長訪談中，故事性與資訊量並重，毫無冷場。",
    "compliance": "符合",
    "segments": []
  },
  {
    "rank": 6,
    "partnerName": "人生挖挖WoW-企業人生策略學",
    "podcastName": "人生挖挖WoW-企業人生策略學",
    "displayName": "人生挖挖WoW-企業人生策略學",
    "score": 81.55,
    "reason": "[EP.111 | 努力為什麼沒有複利？...] 策略性思維的深度拆解，超過80分鐘的長篇大論卻條理清晰，為聽眾帶來高含金量的職涯啟發。",
    "compliance": "符合",
    "segments": []
  },
  {
    "rank": 7,
    "partnerName": "五吉郎",
    "podcastName": "五吉郎",
    "displayName": "五吉郎",
    "score": 79.37,
    "reason": "[EP152｜理財最實在的第一步...] 長篇幅的理財觀念對談，節奏輕鬆幽默，近80分鐘的內容將硬核知識軟化，非常適合長時間聆聽。",
    "compliance": "符合",
    "segments": []
  },
  {
    "rank": 8,
    "partnerName": "五吉郎",
    "podcastName": "五吉郎",
    "displayName": "五吉郎",
    "score": 79.12,
    "reason": "[EP145｜技術封頂就夠了？...] 深入探討美業生存法則，豐富的實戰經驗分享，將近80分鐘的訪談內容層次分明，乾貨滿滿。",
    "compliance": "符合",
    "segments": []
  },
  {
    "rank": 9,
    "partnerName": "教出你的路",
    "podcastName": "教出你的路",
    "displayName": "教出你的路",
    "score": 74.92,
    "reason": "[EP43 原來印度是這樣！...] 多元視角的文化交流，74分鐘的長度足以將複雜的社會議題討論得深入淺出，引發聽眾共鳴。",
    "compliance": "符合",
    "segments": []
  },
  {
    "rank": 10,
    "partnerName": "文森說書",
    "podcastName": "文森說書",
    "displayName": "文森說書",
    "score": 74.08,
    "reason": "[有了百萬英鎊、百萬豪車...] 74分鐘的長篇說書，將一本書的精華與延伸思考娓娓道來，聲音充滿穩定感，是極佳的長篇陪伴內容。",
    "compliance": "符合",
    "segments": []
  }
];

if (data.awards && data.awards.best_long_form) {
    data.awards.best_long_form.ranking = newRanking;
    fs.writeFileSync('awards_top10_results.json', JSON.stringify(data, null, 2), 'utf8');
    console.log('Successfully updated best_long_form ranking.');
} else {
    console.error('Could not find best_long_form in JSON.');
}


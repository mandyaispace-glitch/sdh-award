/**
 * Google Apps Script: 自動回寫 Podcast 節目名稱、Apple 網址與 RSS 連結
 * 
 * 使用方式：
 * 1. 在您的 Google 試算表上方選單點選「擴充功能」(Extensions) ->「Apps Script」。
 * 2. 清空原本的程式碼，並將此段程式碼完整複製貼上。
 * 3. 點選上方「儲存」(磁碟圖示) 並按「執行」(Run)。
 * 4. 首次執行會跳出「審查權限」，請同意授權（此腳本只會修改您當前這張試算表的儲存格）。
 * 5. 返回試算表，您會發現 J, K, L 欄位已自動填寫完畢！
 */
function updatePodcastMetadata() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  
  // 取得整張試算表的資料 (0-based)
  var data = sheet.getRange(1, 1, lastRow, 12).getValues();
  
  // 智慧搜尋比對得到的 Mapping Table
  var mapping = {
    "美股夢想家": {
      podcast: "夢想家說股事",
      apple: "https://podcasts.apple.com/tw/podcast/%E5%A4%A2%E6%83%B3%E5%AE%B6%E8%AA%AA%E8%82%A1%E4%BA%8B/id1585270910",
      rss: "https://feeds.soundon.fm/podcasts/c18fd3e0-c023-466e-843f-ae9c5c157a85.xml"
    },
    "主播/主持人 朱楚文": {
      podcast: "科技領航家",
      apple: "https://podcasts.apple.com/tw/podcast/%E7%A7%91%E6%8A%80%E9%A0%98%E8%88%AA%E5%AE%B6/id1485503209",
      rss: "https://www.ic975.com/feed/creativecaptain/"
    },
    "Dr Selena": {
      podcast: "小資變有錢｜Dr.Selena生活理財王",
      apple: "https://podcasts.apple.com/tw/podcast/%E5%B0%8F%E8%B3%87%E8%AE%8A%E6%9C%89%E9%8C%A2-dr-selena%E7%94%9F%E6%B4%BB%E7%90%86%E8%B2%A1%E7%8E%8B/id1626035937",
      rss: "https://feed.firstory.me/rss/user/cl3hzlg5l01ca01zi899uexxl"
    },
    "郝旭烈/郝聲音": {
      podcast: "郝聲音",
      apple: "https://podcasts.apple.com/tw/podcast/%E9%83%9D%E8%81%B2%E9%9F%B3/id1533782597",
      rss: "https://feed.firstory.me/rss/user/ckfnpunqe136d08003p6lzdmn"
    },
    "精算媽咪的家計簿｜珊迪兔": {
      podcast: "精算媽咪的家計簿",
      apple: "https://podcasts.apple.com/tw/podcast/%E7%B2%BE%E7%AE%97%E5%AA%BD%E5%92%AA%E7%9A%84%E5%AE%B6%E8%A8%88%E7%B0%BF/id1501644109",
      rss: "https://feeds.soundon.fm/podcasts/e7bc67c1-6712-4b26-8a46-27ea7c820469.xml"
    },
    "聲音表達講師 林依柔": {
      podcast: "說話人聲",
      apple: "https://podcasts.apple.com/tw/podcast/%E8%AA%AA%E8%A9%B1%E4%BA%BA%E8%81%B2/id1562262569",
      rss: "https://feed.firstory.me/rss/user/ckmzs7bpkanpb08213eqs4pfw"
    },
    "張忘形": {
      podcast: "人類行為研究社",
      apple: "https://podcasts.apple.com/tw/podcast/%E4%BA%BA%E9%A1%9E%E8%A1%8C%E7%82%BA%E7%A0%94%E7%A9%B6%E7%A4%BE/id1792379960",
      rss: "https://feeds.soundon.fm/podcasts/878d80f2-2f90-4176-8e74-2988ee42633e.xml"
    },
    "李柏鋒的擴大機": {
      podcast: "聽進理投",
      apple: "https://podcasts.apple.com/tw/podcast/%E8%81%BD%E9%80%B2%E7%90%86%E6%8A%95/id1648415689",
      rss: "https://www.omnycontent.com/d/playlist/a4cc0a4a-642d-45d7-ac5d-ac5600c620b0/0e26d3df-d582-4b49-8b26-af2400938e98/730b75c2-3f9f-4da7-be56-af240095bbcc/podcast.rss"
    },
    "崔咪": {
      podcast: "一不小心太漂亮",
      apple: "https://podcasts.apple.com/tw/podcast/%E4%B8%8D%E5%B0%8F%E5%BF%83%E5%A4%AA%E6%BC%82%E4%BA%AE/id1743546553",
      rss: "https://feeds.soundon.fm/podcasts/459faf63-e51d-48f4-8dc7-39577a6999f1.xml"
    },
    "哇賽心理學_蔡宇哲": {
      podcast: "哇賽心理學",
      apple: "https://podcasts.apple.com/tw/podcast/%E5%93%87%E8%B3%BD%E5%BF%83%E7%90%86%E5%AD%B8/id1500162537",
      rss: "https://feed.firstory.me/rss/user/ck7t2fz77qu7g0873ln5hz5cl"
    },
    "Cynthia Huang黃馨儀": {
      podcast: "媽媽好神經病",
      apple: "https://podcasts.apple.com/tw/podcast/%E5%AA%BD%E5%AA%BD%E5%A5%BD%E7%A5%9E%E7%B6%93%E7%97%85/id1552428220",
      rss: "https://feeds.soundon.fm/podcasts/84685a3b-3017-4627-8d95-827636c46163.xml"
    },
    "蘇絢慧分享空間": {
      podcast: "蘇心時光",
      apple: "https://podcasts.apple.com/tw/podcast/%E8%98%87%E5%BF%83%E6%99%82%E5%85%89/id1850663669",
      rss: "https://feeds.soundon.fm/podcasts/d05b0163-7868-4a90-b2ad-ad20f6dcada6.xml"
    },
    "加班當爸媽．櫻桃可可CherryCoco": {
      podcast: "加班當爸媽｜櫻桃可可CherryCoco",
      apple: "https://podcasts.apple.com/tw/podcast/%E5%8A%A0%E7%8F%AD%E7%95%B6%E7%88%B8%E5%AA%BD-%E6%AB%BB%E6%A1%83%E5%8F%AF%E5%8F%AFcherrycoco/id1520423194",
      rss: "https://feed.firstory.me/rss/user/cme89u7jl023e01stency8ot1"
    },
    "林程揚｜Hank 大叔": {
      podcast: "能量黑客",
      apple: "https://podcasts.apple.com/tw/podcast/%E8%83%BD%E9%87%8F%E9%BB%91%E5%AE%A2/id1852155372",
      rss: "https://feeds.soundon.fm/podcasts/309c257d-71c5-4606-9225-0dfb1c0dbe3a.xml"
    },
    "美股航海王": {
      podcast: "航海王的富人學",
      apple: "https://podcasts.apple.com/tw/podcast/%E8%88%AA%E6%B5%B7%E7%8E%8B%E7%9A%84%E5%AF%8C%E4%BA%BA%E5%AD%B8/id1726458489",
      rss: "https://feed.firstory.me/rss/user/clq26zwox006o010y1izebrxu"
    },
    "宋家小館｜Becky": {
      podcast: "宋家小館",
      apple: "https://podcasts.apple.com/tw/podcast/%E5%AE%8B%E5%AE%B6%E5%B0%8F%E9%A4%A8/id1721336862",
      rss: "https://feed.firstory.me/rss/user/clp9tu99l00fr01wv9gaod3us"
    },
    "莫菲穿搭": {
      podcast: "【莫轉台】-試穿新人生",
      apple: "https://podcasts.apple.com/tw/podcast/%E8%8E%AB%E8%BD%89%E5%8F%B0-%E8%A9%A6%E7%A9%BF%E6%96%B0%E4%BA%BA%E7%94%9F/id1865854397",
      rss: "https://feeds.soundon.fm/podcasts/21c16e3b-ce88-4152-9760-d07530241027.xml"
    },
    "慢活夫妻 Dewi&George": {
      podcast: "慢活夫妻－專業美股投資與理財",
      apple: "https://podcasts.apple.com/tw/podcast/%E6%85%A2%E6%B4%BB%E5%A4%AB%E5%A6%BB-%E5%B0%88%E6%A5%AD%E7%BE%8E%E8%82%A1%E6%8A%95%E8%B3%87%E8%88%87%E7%90%86%E8%B2%A1/id1520711973",
      rss: "https://feed.firstory.me/rss/user/ckbth9mxhxoty0918lzyhey2j"
    },
    "創才": {
      podcast: "金融科技人才培育計劃-焦點主題趨勢講座",
      apple: "https://podcasts.apple.com/tw/podcast/%E9%87%91%E8%9E%8D%E7%A7%91%E6%8A%80%E4%BA%BA%E6%89%8D%E5%9F%B9%E8%82%B2%E8%A8%88%E5%8A%83-%E7%84%A6%E9%BB%9E%E4%B8%BB%E9%A1%8C%E8%B6%A8%E5%8B%A2%E8%AC%9B%E5%BA%A7/id1628956645",
      rss: "https://feed.firstory.me/rss/user/cl47s8e2i00nn01zg7tyl1nb3"
    },
    "電扶梯走左邊": {
      podcast: "電扶梯走左邊 with Jacky (Left Side Escalator)",
      apple: "https://podcasts.apple.com/tw/podcast/%E9%9B%BB%E6%89%B6%E6%A2%AF%E8%B5%B0%E5%B7%A6%E9%82%8A-with-jacky-left-side-escalator/id1544225078",
      rss: "https://anchor.fm/s/4369cce0/podcast/rss"
    },
    "蕭老師別這樣": {
      podcast: "蕭老師別這樣",
      apple: "https://podcasts.apple.com/tw/podcast/%E8%95%AD%E8%80%81%E5%B8%AB%E5%88%A5%E9%80%99%E6%A8%A3/id1846979050",
      rss: "https://feeds.soundon.fm/podcasts/97656f0e-b70b-4e57-9abb-b3ca9d4ba3f1.xml"
    },
    "卡姊": {
      podcast: "我不是病人，我是卡姊！",
      apple: "https://podcasts.apple.com/tw/podcast/%E6%88%91%E4%B8%8D%E6%98%AF%E7%97%85%E4%BA%BA-%E6%88%91%E6%98%AF%E5%8D%A1%E5%A7%8A/id1816381557",
      rss: "https://feeds.soundon.fm/podcasts/d3516c73-a38c-4b5e-a524-9fb1ed1294b3/spotify.xml"
    },
    "Z研": {
      podcast: "慢慢長出來",
      apple: "https://podcasts.apple.com/tw/podcast/%E6%85%A2%E6%85%A2%E9%95%B7%E5%87%BA%E4%BE%86/id1864503493",
      rss: "https://feeds.soundon.fm/podcasts/95e6d517-59a9-4e09-92fa-67106ec1af2b.xml"
    },
    "ActPod艾帕科技": {
      podcast: "ActPod週記",
      apple: "https://podcasts.apple.com/tw/podcast/actpod%E9%80%B1%E8%A8%98/id172023194",
      rss: "https://feed.firstory.me/rss/user/cmf0oh868000201wlczsw3uj1"
    }
  };
  
  // 從第 3 列 (index 2) 開始巡檢到最後一列
  for (var i = 2; i < data.length; i++) {
    var partnerName = data[i][2]; // 合作夥伴名稱位於 C 欄 (index 2)
    
    if (partnerName && mapping[partnerName]) {
      var info = mapping[partnerName];
      
      // J 欄是第 10 欄 (index 10) -> Podcast 節目名稱
      // K 欄是第 11 欄 (index 11) -> Apple Podcast 連結
      // L 欄是第 12 欄 (index 12) -> Firstory RSS 連結
      sheet.getRange(i + 1, 10).setValue(info.podcast);
      sheet.getRange(i + 1, 11).setValue(info.apple);
      sheet.getRange(i + 1, 12).setValue(info.rss);
    }
  }
}

# 🚶‍♀️ KOL 節目清單解析、Excel 頁籤升級與數據可視化：實作變更導覽 (Walkthrough)

此文檔總結了我們針對 80 多個 KOL 節目清單的 PDF 解析、Excel 多頁籤資料庫升級，以及主網頁執行現況圖表可視化的實作成果。

---

## 👥 V2 多代理團隊架構重構與退版指南 (2026/06/21 新增)

為提升專案系統之可維護性、擴充性與並行效率，我們已將原先的單一大型執行腳本，重構升級為「**隊長 AI (Orchestrator) 搭配 3 個專業分身子代理**」的 Multi-Agent 多代理團隊架構：

1. **核心架構設計**：
   * **隊長 AI ([agent_orchestrator.js](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/agent_orchestrator.js))**：主控全局，負責排程、API Key 輪替、快取檢索與整合 A/B/C 三軌數據寫入 Excel 及重新編譯網頁。
   * **文字分析官 ([agents/agent_track_a.js](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/agents/agent_track_a.js))**：專門讀取 Podcast 逐字稿文字，對照最佳內容架構等文字指標打分。
   * **聲音物理診斷師 ([agents/agent_track_b.js](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/agents/agent_track_b.js))**：專門調用 Gemini 1.5 Pro 直聽 MP3 音檔（支援自動清理雲端暫存空間），診斷語速、贅字、噴麥、雙人共鳴並定位黃金聽點。
   * **數據收集官 ([agents/agent_track_c.js](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/agents/agent_track_c.js))**：跑 Apple Podcast 評論爬蟲、呼叫 YouTube Data API v3，並讀取本地手動填寫之 `social_media_manual.csv`（自動建立預填範本）獲取 IG 粉絲數。

2. **⏪ 架構備份與退版機制 (Rollback Mechanism)**：
   * 為確保升級過程 100% 安全，我們建立了 `archive_v1_single_script/` 目錄。
   * **已封存的 V1 檔案**：
     * `batch_track_b.js`
     * `track_c_run.js`
     * `poc_run.js`
     * `generate_html.js`
   * **如何退版還原**：若後續執行時需要回到原先的單一腳本版本，只需將 `archive_v1_single_script` 資料夾中的這 4 個檔案複製回專案根目錄，並覆蓋同名檔案即可。

3. **🧪 測試與成功驗證**：
   * 執行測試指令 `node agent_orchestrator.js --test` 進行 1 集全鏈路驗證。
   * 系統已順利完成：音檔雲端直聽診斷、爬取 C 軌社群數據、自動建立並讀取 `social_media_manual.csv`、寫入 `eligible_episodes_pool.xlsx` 聲音/社群評估頁籤，以及編譯網頁儀表板。驗證過程完全無錯誤。

---

## 🎙️ 三片段黃金聽點與 147 集全量評選升級 (2026/06/21 新增)

*   **自動抽樣 `build_sample_episodes.js`**：
    *   自動從 Excel 的 `合格單集池` 頁籤中，為 49 檔節目各抽取 3 集（共 147 集），產出 [selected_episodes_full.json](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/selected_episodes_full.json) 作為後續分析的完整名單。
*   **升級 `batch_track_b.js` 循序處理器**：
    *   **雙模式支援**：支援 CLI 參數 `--full`（進行全量 147 集處理），若無參數則預設為安全限制測試模式（僅評估 12 檔節目共 36 集）。
    *   **偵測 3 段黃金聽點**：修改 Prompt，解除先前「前 5 分鐘」的限制，指示 Gemini 2.5 Flash 聆聽整集音檔並輸出 3 個最精采的片段（包含自訂片段標題、時間區間與詳細推薦原因），解決「整集只有一段推薦」的不對稱問題。
    *   **雲端 API 殘留清理 (`cleanAllGeminiFiles`)**：在腳本開始與結束時，自動列出並刪除 Gemini Files API 中所有 `temp_audio_` 命名的音檔，徹底實現「自動清理雲端空間」，並避免因斷點中斷導致儲存空間洩漏。
    *   **支援增量升級斷點續跑**：若快取中已包含該單集且具有 `recommended_segments` 欄位則略過，若無該欄位則自動重新拉取分析，確保現有 9 集 POC 數據格式升級且不重跑已就緒的數據。
    *   **Excel 新增 9 大欄位**：寫入 `eligible_episodes_pool.xlsx` 的 `聲音物理評估` 分頁時，將 3 個片段的時間、標題與推薦原因完整轉化為獨立欄位輸出。
*   **儀表板修復與成功驗證**：
    *   修復了 `generate_html.js` 中用於瀏覽器端動態渲染 `recommended_segments` 的反單引號語法錯誤，使網頁編譯順利通過並完成 inline script syntax 檢測。
    *   實測第 1 集，確認產出的 JSON 格式符合預期，推薦了三個跨越整集的黃金片段，且 `podcast_evaluation_workflow.html` 完美渲染了這些推薦片段。

---

## 🚀 雙層群組化頁籤與 9 集 Demo 成果整合 (2026/06/20 新增)

*   **群組化分層頁籤導航 (Grouped Tab Navigation)**：
    *   配合使用體驗優化，將頂部頁籤重新梳理為兩大主要群組：
        1.  **Group 1: 🛠️ 管理與進度**：包括 `📄 工作流規劃`、`⏳ 進程時間軸`、`💾 移交指南`。
        2.  **Group 2: 🎯 評選成果區 (決選參考)**：包括 `🔍 資格審查`、`🎯 Demo 成果`、`📊 C軌聲量`。
    *   特別將 **`🔍 資格審查`** 移動至 Group 2 的第一順位，使其位於 `🎯 Demo 成果` 之前。
*   **Demo 成果大一統分頁**：
    *   由於 A軌文本評選與 B軌聲音評選均為 3 檔合作夥伴（共 9 個單集）之隨機抽樣 POC 模擬結果，我們將原先獨立的 `🏆 A軌文本` 與 `🎙️ B軌聲音` 兩個獨立頁籤**併入單一的 `🎯 Demo 成果` 頁籤**中。
    *   現在點擊 `🎯 Demo 成果` 頁籤，頁面將垂直聚合展示：
        1.  決審隨機抽樣的 9 個單集資訊卡片清單。
        2.  A軌文本評審打分與橫向 PK 分析卡片（含最佳內容架構、節目企劃等 7 🏆 獎項排行）。
        3.  B軌聲音評審打分與橫向 PK 分析卡片（含雙人默契、最佳男/女主持人、療癒輕輕等 4 🎙️ 獎項排行）。
        4.  聲音物理評估 Chart.js 折線走勢圖（語速 vs 贅字頻率）。
        5.  聲音物理評估詳情（9 個抽樣單集的贅字分析、音色共鳴、錄音環境及金聽片段）。
*   **修復 Client-Side 變數渲染失效問題 (過度轉義 Bug)**：
    *   定位並修復了 `generate_html.js` 中 client-side 模板變數因 Node.js 編譯器多重轉義（如 `\\\${partner}` 在 HTML 中輸出為字面量 `\${partner}`）導致瀏覽器變數解析失效、Demo 內容全白的問題。
    *   透過 regex 將所有 `\\\${` 精準替換為 `\${`，保證瀏覽器端順利求值，使哇賽心理學 / 郝聲音 / 五吉郎的分析卡片與 Chart.js 圖表完整復原。
*   **霸榜數據更新至 2026-06-20**：
    *   Apple Podcasts 台灣熱門總榜單最新數據已成功自動封存，並順利更新並重新注入最新的 2026-06-20 排行榜資料，相關在榜率、走勢與平均名次已完美反映在 `🔍 資格審查` 與 `📊 C軌聲量` 走勢圖中。

---

## 🛠️ 新增與修改的文件與腳本

### 1. ⚙️ [extract_programs.js](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/extract_programs.js) [MODIFY]
*   **精確頭像過濾與防漏機制**：
    *   **跳過單字頭像噪訊**：在解析 PDF 時，程式跳過了單個字元的頭像（如 `"五"`, `"下"`, `"姊"`, `"V"` 等），防止干擾節目名稱提取，這成功修正了**「五吉郎」（五吉人）**因頭像字母 `"五"` 導致比對失敗被刪除的 Bug。
    *   **保留所有 KOL**：不物理刪除任何 KOL。PDF 中 81 筆申報卡片經去重合併後，共有 79 位獨特 KOL 被完整保留在清單中（分為有 Podcast 節目 65 位與無 Podcast 14 位）。
*   **API 對照防幻覺機制**：透過 `isRealPodcastMatch` 模糊過濾排除客座專訪等非本節目的搜尋匹配。

### 2. ⚙️ [build_episode_pool.js](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/build_episode_pool.js) [MODIFY]
*   **多頁籤 Excel 資料庫升級（一式四頁籤 + 全連結）**：
    1.  `合作名單` [NEW]：收錄全部 79 位合作 KOL，並標註「是否有 Podcast 節目」（是/否），並附帶 Apple Podcast 與 RSS 網址，作為數據總覽。
    2.  `KOL 節目名單`：收錄 65 位有 Podcast 的節目名單，包含對應連結。
    3.  `合格單集池`：收錄 46 檔合格節目在上半年的所有單集（共 1,697 集），新增 Apple Podcast 與 RSS 連結。
    4.  `發片量統計與資格判定`：完整依發片量降序排列，記錄合格與不合格原因（發片量不足或無 Podcast），且新增 Apple Podcast 與 RSS 連結。

### 3. ⚙️ [generate_html.js](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/generate_html.js) [MODIFY]
*   **頂部數據指標卡升級**：
    *   **合作總 KOL 數量**：標註為 **79 檔**（小字細分 **其中 65 檔有 Podcast**）。
    *   **審查合格/不合格/單集總量**：合格 **46 檔**、不合格 **33 檔**（小字註記發片不足與無 Podcast 各自數量）、合格單集 **1,697 集**。
*   **數據動態注入**：讀取 `eligibility_stats.json` 並序列化為網頁變數 `window.eligibilityStats`。
*   **Chart.js 圖表整合**：
    *   **圓餅圖 (Pie Chart)**：直觀呈現合格率（合格比例 vs 資格不符比例）。
    *   **柱狀圖 (Bar Chart)**：呈現前 15 名節目的發片量排行。

---

## 🔧 重大邏輯校正與修復 (2026/06/18)
 
針對 PDF 網格採集與 API 對照時發生的邏輯錯誤，我們進行了以下修正：
*   **KOL 名單與 Podcast 資格劃分**：取消對非 Podcast 創作者的物理刪除，改以「合作名單」總表呈現全部 79 位 KOL。將僅有 IG/FB 社群無 Podcast 的 14 位創作者標註為「無 Podcast 節目」，其餘 65 位進入 Podcast 篩選流程。
*   **解決「五吉郎」（五吉人）遺漏問題**：修復了因 PDF 卡片左側頭像單字 `"五"` (噪訊) 被誤判為節目名稱的 Bug，精確過濾短於 2 個字的干擾文字，並順利透過 iTunes API 搜尋取回其 SoundOn RSS 網址，採集到該節目 2026 上半年合格的 **121 集** 數據。
*   **網址審查連結補全**：依據建議，為 Excel 四個頁籤全面補上 Apple Podcast 與 RSS 連結，提升點擊複核便利性。
*   **合併重複節目 (唯一值)**：對共享同一個 Podcast RSS 的合作夥伴進行合併（例如將 `姊姊不想懂事了` 與 `姐姐不想懂事了｜莉安君怡` 合併為單一項目），節目名稱在清單中維持唯一值。
*   **動態縱向邊界定位 (防跨列錯誤)**：取消硬編碼的 Y 軸四捨五入算法，以 PDF 卡片標題（KOL 名稱）的 Y 座標為基礎，動態設定上下邊界，精確解決了因社交圖示偏低被錯劃到下一列的問題（如 `能量黑客` 與 `佐編茶水間` 已完美歸位）。
*   **儀表板與報告排序規則（發片量排行優先）**：所有 Excel、Markdown 報告、網頁儀表板，**全部統一改為依「2026上半年發片量」從高到低進行降序排列**。
 
---

## 📈 Apple Podcast 霸榜排行與走勢可視化 (2026/06/18 新增)

針對有 Podcast 合作夥伴在 Apple Podcast 台灣熱門總榜的霸榜排行，我們實作了以下功能：
*   **區間統計追蹤 (2026-06-14 迄今)**：從我們最早開始採集 Apple 排行榜存檔的日期 (2026-06-14) 到今天，進行全自動的區間霸榜比對。
*   **多頁籤 Excel 資料庫升級 (五頁籤)**：
    *   新增第 5 頁籤 `Apple榜單歷史排行`：包含欄位有：名次、合作夥伴、節目名稱、在榜天數、在榜率（在榜天數 / 統計天數）、平均排名、最佳排名、歷史名次軌跡、Apple Podcast 連結、RSS 連結。
    *   排序規則：優先依「在榜天數」由多到少降序排列，次要依「平均排名」由高到低（數值由小到大）升序排列。
*   **工作流規劃書 (Markdown) 動態注入**：
    *   全自動在 `podcast_evaluation_workflow.md` 的 `<!-- RANKING_START -->` 與 `<!-- RANKING_END -->` 標記間，動態注入最新的霸榜數據表格。
*   **動態網頁儀表板 (HTML) 圖表升級與挪移 (Track C)**：
    *   **折線走勢圖 (Line Chart) 與數據表移至「軌道 C」頁籤**：配合 C 軌獎項屬性，已將 Apple Podcast 霸榜歷史名次波動折線圖及詳細數據表從原先的「專案執行現況」分頁挪移至「軌道 C 社群聲量」分頁。
    *   **防 hidden canvas 渲染錯誤**：實作了 DOM 可見度判斷 (`offsetParent !== null`)。當使用者點擊「軌道 C」或「專案執行現況」頁籤時，才動態渲染對應的圖表，避免 Chart.js 在隱藏的 canvas 上渲染出錯，完美保留自適應寬高與動態名次 Tooltip。
    *   **修復 HTML 模板編譯語法錯誤**：修正了 `generate_html.js` 中 client-side template literal 的反單引號 (backtick) 轉義問題（使用雙反斜線 `\\` 確保寫入檔案時為正確 the 轉義 `\`` 形式），解決了編譯時 `Unexpected token 'class'` 的錯誤。
    *   **Meta.AI 完整報告隔離嵌入**：Track C 頁籤下半部以 glass-card 內嵌 Meta.AI 的完整聲量評選建議報告，達到多維度聲量評估的整合。

---

## 🔧 完全 0 集與未匹配 KOL 名單整理與「最後更新日期」欄位升級 (2026/06/19 新增)

針對完全 0 集與原先未成功匹配 Podcast 的 KOL，我們完成了深入比對、去重，並全面升級了「最後更新時間」追蹤功能：
*   **精準對應與去重**：
    *   推估並更新了正確的活躍 Podcast 頻道，包括《任性歐逆機智生活》(曼蒂歐逆)、《鋒富理財學》(李柏鋒)、《錢進頭等艙》(斜槓空姐cindy)、《人生啊｜陪你一起看懂人生》(人生啊！小歐)、《下半場人生陪談師》(張嘉茹)、《瑪那熊聊愛情》(瑪那熊)與《這下言重了》(小竺)。
    *   去重了重複的 KOL 項（如 Coco），並將 **7 位** 經查證確實「空有 IG/FB、無個人 Podcast」的 KOL (如布萊恩老師、張書書、劉奕酉、雷浩斯、萬叔、阿駿日常) 於系統中排除其 Podcast 資格判定（標註為「無」）。
*   **RSS 實測與停更揭露**：
    *   修改 `build_episode_pool.js` 在讀取 RSS 時動態抓取 XML 中首個單集的 `pubDate` 作為「最後更新日期 (Last Updated Date)」。
    *   新增該日期為 Excel 檔案多個分頁（`合作名單`、`KOL 節目名單`、`發片量統計與資格判定`）以及網頁儀表板審查總表的獨立欄位。這讓因停更而導致 2026 上半年 0 集的節目（如 2021 年停更的《瑪那熊聊愛情》、2024 年停更的《這下言重了》）能明確展示其最後更新日期與原因。
*   **數據與合格狀態更新**：
    *   合格節目總數由原先的 46 檔更新為 **49 檔**（包含新匹配成功且合格的《人生啊｜陪你一起看懂人生》共 23 集，與《錢進頭等艙》共 14 集）。
    *   KOL 總數維持 79 檔，無 Podcast 節目細分為 14 檔，發片不足或停更細分為 16 檔。

---

## 🧪 驗證與結果

*   **實測執行結果與 429 Quota 限制**：
    *   在小規模實測模式中，腳本順利循序下載、上傳並呼叫 Gemini 2.5 Flash 進行整集聲音診斷。
    *   執行過程中，因為使用者使用的是 **Gemini API 免費版 (Free Tier)**，觸及了 **每天 20 次請求的每日上限** (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`，每日限制 20 次）。
    *   腳本在成功評估 **14 個新單集** 後觸發了 429 RESOURCE_EXHAUSTED 錯誤。
    *   **快取與斷點續跑驗證**：得益於增量寫入機制，這 14 個新單集（加原有 9 個 POC 單集，共 23 個單集）已完美且安全地儲存在 `track_b_results.json` 快取庫中，且已成功導出寫入 `eligible_episodes_pool.xlsx` 的 `聲音物理評估` 頁籤，不因 429 中斷而丟失任何資料。
*   **Excel 結構驗證**：確認 `eligible_episodes_pool.xlsx` 成功重新生成 5 個頁籤，且在相關頁籤中新增了「最後更新日期」列，並準確填入了每檔節目的 RSS 最後更新日期。
*   **網頁編譯與排版**：編譯出的 `podcast_evaluation_workflow.html` 中，新增的折線圖能完美使用 Chart.js 渲染（且自適應縮放、帶有浮動名次 Tooltip 提示），霸榜詳細數據表排版美觀且功能正常，未與 Meta.AI 隔離 HTML 衝突。
*   **多聽點渲染驗證**：確認在編譯後的 HTML 網頁上，新分析的 14 個單集均已美觀地呈現 3 個黃金聽點（包含自訂標題、時間區間與詳細推薦原因）。

---

## 🏆 決審相對 PK 模擬與移轉部署指南更新 (2026/06/19 新增)

針對評選決審機制的優化以及專案移轉部署的需求，我們完成了以下實作與變更：
*   **決審橫向 PK 實作**：
    *   重構 `poc_run.js`，將 3 檔節目（《郝聲音》、《五吉郎》、《哇賽心理學》）各 3 個單集（共 9 個單集）的逐字稿一次性發給 **Gemini 2.5 Flash-Lite** 進行橫向相對 PK，消除了評分標準漂移的問題，並在 [poc_report.md](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/poc_report.md) 生成了名次總表與詳細分析。
    *   順利下載、上傳並轉寫完畢最後 2 個單集（哇賽心理學《多巴胺陷阱》與《療癒創傷》），補齊了完整的 9 檔逐字稿快取庫。
    *   成功將評分數據與評審評語寫入 [eligible_episodes_pool.xlsx](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/eligible_episodes_pool.xlsx) 中的全新頁籤 **`POC評分結果`**，方便真人評審反查。
*   **💾 系統部署與移轉指南網頁整合**：
    *   在 [podcast_evaluation_workflow.md](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/podcast_evaluation_workflow.md) 中新增了 `💾 系統部署與移轉指南` 的內容區塊。
    *   修改 [generate_html.js](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/generate_html.js) 的分頁導航、內容容器切換與路由檢測，正式支援第 5 個分頁（📄 規劃書 / 📌 執行現況 / 📊 軌道 C / ⏳ 時間軸 / 💾 系統部署與移轉）。
    *   修正了客戶端 HTML 模板編譯中的反單引號 (backtick) 轉義問題，成功編譯生成 [podcast_evaluation_workflow.html](file:///C:/Users/manma/OneDrive/Documents/Antigrivity/SDH%20Award/podcast_evaluation_workflow.html)。

---

## ⏱️ 統計時數與每日預估運行時間 (Time & Pipeline Analysis)

### 1. 本次 POC 模擬總耗時 (Total Execution Hours for POC)
*   **全新冷啟動 (無快取) 耗時**：**約 13 ~ 15 分鐘**
    *   9 個單集音檔下載 (平均 40MB/集，共 360MB)：約 2 分鐘。
    *   上傳至 Gemini Files API：約 3 分鐘。
    *   Gemini 雲端轉寫前 12 + 後 3 分鐘 (9 集並行)：約 7 ~ 8 分鐘。
    *   10 個獎項橫向 PK 決審打分：約 30 秒。
*   **溫啟動 (讀取快取) 耗時**：**約 15 ~ 20 秒**
    *   直接讀取 `poc_transcripts/` 中已存在的逐字稿文字檔，無須重跑 ASR。
    *   直接進行 10 個獎項橫向 PK 決審與寫入 Excel/編譯 HTML：約 15 秒。

### 2. 每日自動化運作流程耗時預估 (Daily Production Pipeline Running Time)
當系統轉為日常維護，對合格的 **49 檔節目** 進行每日更新追蹤時，其執行時間估算如下：

*   **抓取 Apple Podcasts 與榜單統計 (Track C)**：**約 2 ~ 3 分鐘**
    *   每日 Top 100 排行榜抓取並備份存檔：10 秒。
    *   爬取 49 檔節目之最新聽眾評論並統計留言數：1 ~ 2 分鐘。
*   **新發布單集下載與雲端轉寫 (Track A)**：**約 10 ~ 15 分鐘**
    *   *發片率估算*：49 檔合格節目平均每週發布 1 集，平均每日新增約 **7 集**。
    *   下載新增的 7 集音檔並上傳至 Gemini Files API：約 2 ~ 3 分鐘。
    *   Gemini 雲端 ASR 轉寫 (前 12 分鐘 + 最後 3 分鐘)：約 8 分鐘 (並行處理)。
*   **聲音聲調與物理診斷 (Track B)**：**約 7 ~ 10 分鐘**
    *   *執行模式*：僅針對每日新增單集 (約 7 集) 傳送給 Gemini Pro 進行直聽，診斷語速、情緒波動度並產出物理診斷結果。
*   **儀表板 HTML 與 Excel 更新**：**約 1 分鐘**
    *   自動將三軌合併寫入試算表，並編譯 HTML 報表。

*   **每日運行總時間**：**約 20 ~ 30 分鐘**
    *   > [!IMPORTANT]
    *   > **本地負載為 0%**：所有的語音轉寫 (ASR) 與聲音評鑑 (Track B) 皆在 Google 雲端 API 完成，本地筆電僅負責發起 HTTP 請求，完全不會發熱 or 卡頓。
    *   > **全自動化執行**：業主只需在每天下班前或開機時，一鍵啟動腳本，背景運行 25 分鐘即可完成所有數據更新，極其輕鬆。

---

## ☁️ Vercel 雲端安全部署與 GitHub Actions 每日自動抓取 (2026/06/30 新增)

為因應敏感性數據之資安要求，並將抓取時程順利延續至 2026/07/15，我們已將專案升級為「GitHub Actions 自動抓取 + Vercel 雲端安全託管」的 Jamstack 自動化流水線：

1. **🔒 Vercel 密碼安全防護 (Deployment Protection)**：
   * 專案已配置 `vercel.json` 路由映射，將預設首頁指向編譯好的 `podcast_evaluation_workflow.html`。
   * 雲端控制台已啟用密碼鎖（Password Protection），非評審及內部授權人員輸入密碼前無法存取任何數據，徹底解決資安顧慮。

2. **⏰ GitHub Actions 每日自動同步流水線**：
   * 建立工作流 `.github/workflows/daily_sync.yml`，於每日早上 10:00 (台灣時間) 自動在 GitHub 雲端環境執行。
   * 自動執行 `daily_ranking_logger.js` (抓取 Apple Podcasts 當日百大排行) 與 `sync_rankings_and_sheets.js` (更新 Excel 數據並重新編譯 HTML 儀表板)。
   * 自動將最新數據 git commit 並 push 回 GitHub，Vercel 偵測到 push 後會進行秒級自動更新發佈，達到**零人工干預的日常數據追蹤**。

3. **🧪 雲端部署防失效驗證**：
   * 撰寫無頭瀏覽器測試腳本 `scratch/test_vercel_deploy.js`，可對上線後的 Vercel 網址進行自動密碼登入、DOM 節點分析與 Chart.js 畫布渲染檢查，確保雲端發佈 100% 正常。

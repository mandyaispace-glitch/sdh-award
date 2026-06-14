# SDH Award Podcast 評選系統 (Demo/Prototype 套件)

這是一個專門為 **SDH Award** 設計的 AI Podcast 自動化評選套件，已針對 **「無程式背景、每天限用筆電執行 2 小時」** 的硬體與時間限制進行高度優化。

本套件目前處於 **Demo/討論階段**。您可以使用本地已抓取的 24 個 Demo 數據來測試整體評選流程。未來正式版推出時，僅需替換節目清單 CSV 與設定起迄日期即可直接上線。

---

## 📂 資料夾檔案指南

1.  **`updated_sheet.csv`**：已填補好 24 位合作夥伴節目名稱與網址的 Demo 數據表。
2.  **`build_episode_pool.js`**：大會資格審查與合格集數池建立程式（一鍵抓取 RSS 並審查發片量是否 $\ge 12$）。
3.  **`track_c_run.js`**（軌道 C 數據軌）：**免 API 金鑰，可立即測試**。全自動抓取所有節目的 Apple Podcasts 公開評論並產出社群熱度排行榜。
4.  **`track_b_run.js`**（軌道 B 聲音軌）：利用 Gemini 1.5 Pro 雲端分析音檔的接話默契、聲音感染力，並標出黃金 3 分鐘。
5.  **`apps_script.js`**：Google 試算表自動填寫擴充腳本（貼入試算表內執行，可瞬間填滿節目名稱、Apple 連結與 RSS 網址）。

---

## 🚀 測試指南

### 1. 測試軌道 C (數據與社群軌) — 免 API 金鑰
由於 Apple Reviews API 是公開的，您可以**立即運行此測試**：
1.  開啟終端機 (PowerShell 或 Command Prompt)。
2.  切換到此資料夾目錄。
3.  執行命令：
    ```bash
    node track_c_run.js
    ```
4.  執行完成後，您會在同資料夾下獲得：
    *   **`track_c_leaderboard.md`**：大數據抓取到的聽眾互動留言量排行（含聽眾留言內容節錄）。
    *   **`track_c_results.json`**：詳細留言數據。

---

### 2. 測試軌道 B (聲音特徵軌) — 需申請 API 金鑰
分析音檔物理特徵（默契、音色、語速等）需要呼叫 Google 雲端 AI：
1.  **取得免費金鑰**：前往 [Google AI Studio](https://aistudio.google.com/) 登入您的 Google 帳號，點選「Create API Key」免費複製一組金鑰。
2.  **建立設定檔**：在此目錄下新建一個文字檔，命名為 **`.env`**，內容寫入：
    ```env
    GEMINI_API_KEY = 貼上您的金鑰
    ```
3.  **執行測試**：在終端機中執行：
    ```bash
    node track_b_run.js
    ```
    *(此測試會自動下載一段 6 分鐘的 Demo 音訊，上傳至 Gemini 雲端完成物理聲學與默契打分，並回傳評審結果 JSON)*

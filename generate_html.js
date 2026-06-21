const fs = require('fs');
const path = require('path');

function generateSelfContainedHtml() {
    const mdPath = path.join(__dirname, 'podcast_evaluation_workflow.md');
    if (!fs.existsSync(mdPath)) {
        console.error("找不到 podcast_evaluation_workflow.md 檔案。");
        return;
    }
    
    const mdContent = fs.readFileSync(mdPath, 'utf-8');
    
    // Check if Meta.AI social analysis exists to enable Track C tab
    const socialHtmlPath = path.join(__dirname, 'Meta.AI', 'Podcast聲量評選建議.html');
    let hasTrackC = false;
    
    if (fs.existsSync(socialHtmlPath)) {
        hasTrackC = true;
        console.log("找到 Meta.AI/Podcast聲量評選建議.html，將使用 iframe 隔離嵌入以保持 100% 原始設計樣式。");
    } else {
        console.warn("⚠️ 未找到 Meta.AI/Podcast聲量評選建議.html 檔案，將略過軌道三整合。");
    }
    
    // Load eligibility stats for Chart.js rendering
    let stats = {
        summary: { totalPrograms: 0, eligiblePrograms: 0, ineligiblePrograms: 0, totalEpisodes: 0 },
        programs: []
    };
    const statsPath = path.join(__dirname, 'eligibility_stats.json');
    if (fs.existsSync(statsPath)) {
        try {
            stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
            console.log(`成功加載統計數據：共 ${stats.summary.totalPrograms} 檔節目，合格 ${stats.summary.eligiblePrograms} 檔。`);
        } catch (e) {
            console.error("讀取 eligibility_stats.json 失敗：", e.message);
        }
    }
    
    // Load POC results
    let pocResults = null;
    const pocResultsPath = path.join(__dirname, 'poc_results.json');
    if (fs.existsSync(pocResultsPath)) {
        try {
            pocResults = JSON.parse(fs.readFileSync(pocResultsPath, 'utf-8'));
            console.log("成功加載 POC 評分結果。");
        } catch (e) {
            console.error("讀取 poc_results.json 失敗：", e.message);
        }
    }
    
    // Load Selected Episodes
    let selectedEpisodes = null;
    const selectedEpisodesPath = path.join(__dirname, 'selected_episodes_for_poc.json');
    if (fs.existsSync(selectedEpisodesPath)) {
        try {
            selectedEpisodes = JSON.parse(fs.readFileSync(selectedEpisodesPath, 'utf-8'));
            console.log(`成功加載 POC 抽樣單集清單。`);
        } catch (e) {
            console.error("讀取 selected_episodes_for_poc.json 失敗：", e.message);
        }
    }

    // Load Track B results
    let trackBResults = null;
    const trackBResultsPath = path.join(__dirname, 'track_b_results.json');
    if (fs.existsSync(trackBResultsPath)) {
        try {
            trackBResults = JSON.parse(fs.readFileSync(trackBResultsPath, 'utf-8'));
            console.log("成功加載 Track B 評分結果。");
        } catch (e) {
            console.error("讀取 track_b_results.json 失敗：", e.message);
        }
    }
    
    // Calculate custom breakdown values for cooperative KOLs
    const noPodcastCount = stats.programs.filter(p => p.reason && p.reason.includes('無 Podcast')).length;
    const insufficientCount = stats.programs.filter(p => !p.eligible && p.reason && !p.reason.includes('無 Podcast')).length;
    const totalKols = stats.summary.totalKols || stats.summary.totalPrograms || 79;
    const hasPodcastCount = stats.summary.hasPodcastCount || (stats.summary.totalPrograms - noPodcastCount) || 65;
    
    const htmlTemplate = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>SDH Award Podcast AI 評選規劃書</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        'sans-tc': ['"Noto Sans TC"', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
                        'sans': ['Outfit', 'system-ui', '-apple-system', '"Noto Sans TC"', 'sans-serif'],
                    },
                    colors: {
                        'ink': '#1a1c1e',
                        'brand-red': '#E8452A',
                        'brand-orange': '#e56b1f',
                        'brand-blue': '#2a7de1',
                        'line': '#e6ddd3',
                        'muted': '#6b7280',
                        'wash': '#fdf9f5',
                        'sdh-red': '#E8452A',
                        'sdh-cream': '#fdf9f5',
                        'sdh-paper': '#fcf7f1',
                        'sdh-ink': '#1a1c1e',
                        'sdh-mute': '#6b7280',
                        'sdh-line': '#e6ddd3',
                    }
                }
            }
        }
    </script>
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Noto+Sans+TC:wght@300;400;500;700;800;900&display=swap" rel="stylesheet">
    <!-- Marked.js (Markdown Parser) -->
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <!-- Mermaid.js (Diagram Parser) -->
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <!-- Chart.js CDN -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
    
    <style>
        body {
            font-family: 'Outfit', 'Noto Sans TC', sans-serif;
            background: radial-gradient(circle at 50% 0%, #f8fafc 0%, #e2e8f0 100%);
            color: #334155;
        }
        /* Custom styles for light-theme markdown content rendering */
        .prose h1 {
            font-size: 2rem;
            font-weight: 800;
            color: #0f172a;
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 0.5rem;
            margin-top: 2.5rem;
            margin-bottom: 1.5rem;
            background: linear-gradient(to right, #1d4ed8, #3b82f6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .prose h2 {
            font-size: 1.5rem;
            font-weight: 700;
            color: #1e3a8a;
            margin-top: 2rem;
            margin-bottom: 1rem;
            border-left: 4px solid #3b82f6;
            padding-left: 0.75rem;
        }
        .prose h3 {
            font-size: 1.25rem;
            font-weight: 600;
            color: #0f172a;
            margin-top: 1.5rem;
            margin-bottom: 0.75rem;
        }
        .prose p {
            margin-bottom: 1rem;
            line-height: 1.8;
            color: #475569;
        }
        .prose table {
            width: 100%;
            border-collapse: collapse;
            margin: 1.5rem 0;
            background: #ffffff;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
            border: 1px solid #e2e8f0;
        }
        .prose th {
            background: #f1f5f9;
            color: #1e3a8a;
            font-weight: 700;
            padding: 0.75rem 1rem;
            text-align: left;
            border-bottom: 2px solid #e2e8f0;
        }
        .prose td {
            padding: 0.75rem 1rem;
            border-bottom: 1px solid #f1f5f9;
            color: #334155;
            font-size: 0.95rem;
        }
        .prose tr:hover {
            background: #f8fafc;
        }
        .prose blockquote {
            border-left: 4px solid #3b82f6;
            background: #eff6ff;
            color: #1e40af;
            padding: 1.25rem;
            margin: 1.5rem 0;
            border-radius: 0 10px 10px 0;
            font-weight: 500;
        }
        .prose strong {
            color: #2563eb;
            font-weight: 700;
        }
        .prose a {
            color: #2563eb;
            text-decoration: underline;
            transition: color 0.2s;
            font-weight: 500;
        }
        .prose a:hover {
            color: #1d4ed8;
        }
        .prose ul {
            list-style-type: disc;
            padding-left: 1.5rem;
            margin-bottom: 1rem;
            color: #475569;
        }
        .prose li {
            margin-bottom: 0.5rem;
            line-height: 1.7;
        }
        /* Glassmorphic White Cards */
        .glass-card {
            background: rgba(255, 255, 255, 0.85);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid rgba(226, 232, 240, 0.8);
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02);
        }
        /* Custom Scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        ::-webkit-scrollbar-track {
            background: #f1f5f9;
        }
        ::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
        }
        #poc-overall-summary, #poc-overall-summary-a, #poc-overall-summary-b {
            color: #eff6ff !important;
        }
        /* Hide scrollbar for Chrome, Safari and Opera */
        .scrollbar-none::-webkit-scrollbar {
            display: none;
        }
        /* Hide scrollbar for IE, Edge and Firefox */
        .scrollbar-none {
            -ms-overflow-style: none;  /* IE and Edge */
            scrollbar-width: none;  /* Firefox */
        }
    </style>
</head>
<body class="min-h-screen py-10 px-4 sm:px-6 lg:px-8 bg-[#f0efed]">
    <div class="max-w-5xl mx-auto">
        <!-- Floating Header -->
        <header class="flex justify-between items-center mb-10 pb-5 border-b border-slate-200">
            <div class="flex items-center space-x-3">
                <span class="text-2xl font-extrabold tracking-wider text-blue-600">SDH Award</span>
                <span class="text-xs bg-blue-100 text-blue-600 py-1 px-2 rounded-full font-semibold">AI評選系統 Demo</span>
            </div>
            <div class="text-xs text-slate-500">
                更新時間: ${new Date().toISOString().split('T')[0]} | 設計者: Antigravity
            </div>
        </header>

        <!-- Grouped Tab Navigation -->
        <div class="flex flex-col lg:flex-row lg:space-x-6 space-y-4 lg:space-y-0 mb-6 bg-slate-100/60 p-4 rounded-2xl border border-slate-200/50 backdrop-blur-md">
            <!-- Group 1: 管理與進度 -->
            <div class="flex-[3] flex flex-col space-y-2">
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-wider pl-1.5 flex items-center space-x-1">
                    <span>🛠️ 管理與進度</span>
                </span>
                <div class="flex flex-wrap gap-1.5 p-1 bg-slate-200/40 rounded-xl border border-slate-200/20">
                    <a id="tab-btn-plan" href="#plan" class="flex-1 py-2 text-center text-[11px] sm:text-xs font-bold rounded-lg transition-all duration-200 bg-white text-blue-600 shadow-sm border border-slate-200/10" onclick="switchTab('plan'); return false;">
                        📄 工作流規劃
                    </a>
                    <a id="tab-btn-timeline" href="#timeline" class="flex-1 py-2 text-center text-[11px] sm:text-xs font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50" onclick="switchTab('timeline'); return false;">
                        ⏳ 進程時間軸
                    </a>
                    <a id="tab-btn-deploy" href="#deploy" class="flex-1 py-2 text-center text-[11px] sm:text-xs font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50" onclick="switchTab('deploy'); return false;">
                        💾 移交指南
                    </a>
                </div>
            </div>
            
            <!-- Vertical divider line on desktop -->
            <div class="hidden lg:block w-px bg-slate-200/80 my-2"></div>

            <!-- Group 2: 評選成果決選參考 -->
            <div class="flex-[2] flex flex-col space-y-2">
                <span class="text-[10px] font-black text-indigo-400 uppercase tracking-wider pl-1.5 flex items-center space-x-1">
                    <span>🎯 評選成果區 (決選參考)</span>
                </span>
                <div class="flex flex-wrap gap-1.5 p-1 bg-slate-200/40 rounded-xl border border-slate-200/20">
                    <a id="tab-btn-eligibility" href="#eligibility" class="flex-1 py-2 text-center text-[11px] sm:text-xs font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50" onclick="switchTab('eligibility'); return false;">
                        🔍 資格審查
                    </a>
                    ${hasTrackC ? `
                    <a id="tab-btn-track-c" href="#track-c" class="flex-1 py-2 text-center text-[11px] sm:text-xs font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50" onclick="switchTab('track-c'); return false;">
                        📊 C軌聲量
                    </a>
                    ` : ''}
                </div>
            </div>

            <!-- Vertical divider line on desktop -->
            <div class="hidden lg:block w-px bg-slate-200/80 my-2"></div>

            <!-- Group 3: POC 模擬區 (Demo) -->
            <div class="flex-[1.5] flex flex-col space-y-2">
                <span class="text-[10px] font-black text-rose-400 uppercase tracking-wider pl-1.5 flex items-center space-x-1">
                    <span>🧪 POC 模擬區 (Demo)</span>
                </span>
                <div class="flex flex-wrap gap-1.5 p-1 bg-slate-200/40 rounded-xl border border-slate-200/20">
                    <a id="tab-btn-demo" href="#demo" class="flex-1 py-2 text-center text-[11px] sm:text-xs font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50" onclick="switchTab('demo'); return false;">
                        🎯 Demo 成果
                    </a>
                </div>
            </div>
        </div>

        <!-- Main Content Card -->
        <div id="main-glass-card" class="glass-card rounded-2xl p-6 sm:p-10 mb-8">
            <div id="content-plan" class="prose max-w-none">
                <!-- Plan Markdown renders here -->
                <div class="flex justify-center items-center py-20">
                    <svg class="animate-spin h-10 w-10 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </div>
            </div>
            
                        <div id="content-demo" class="prose max-w-none hidden">
                <!-- POC Sample Episodes Section -->
                <div id="poc-dashboard" class="not-prose mb-10 hidden pt-4">
                    <h3 class="text-base font-extrabold text-slate-800 mb-4 border-l-4 border-blue-600 pl-2">
                        🎯 決審隨機抽樣 POC 單集清單 (每檔各 3 集)
                    </h3>
                    <p class="text-xs text-slate-500 mb-4">
                        為進行決審 POC 模擬評選，系統自合格單集池中隨機抽出以下 9 個單集。這些單集的轉寫內容將作為軌道 A 文本獎與軌道 B 聲音獎的評比依據。
                    </p>
                    <!-- Episodes list grid -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6" id="poc-episodes-list">
                        <!-- Episode lists dynamically injected -->
                    </div>
                </div>

                <!-- Track A POC Results inside Demo Tab -->
                <div class="not-prose mt-10 space-y-6 border-t border-slate-200/60 pt-8">
                    <h3 class="text-base font-extrabold text-slate-800 mb-4 border-l-4 border-blue-600 pl-2">
                        🏆 A軌文本決選參考 (POC 成果)
                    </h3>
                    
                    <!-- Overall Summary Card -->
                    <div class="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 rounded-2xl text-white shadow-md mb-6 space-y-2">
                        <h4 class="text-sm font-extrabold flex items-center text-white">
                            <span class="text-lg mr-2">🔮</span> 評審團文本評選綜合總評
                        </h4>
                        <p id="poc-overall-summary-a" class="text-xs text-blue-50 leading-relaxed font-medium" style="color: #eff6ff !important;">
                            <!-- Injected summary -->
                        </p>
                    </div>
                    
                    <!-- Track A Awards container -->
                    <div class="space-y-6" id="poc-awards-container-track-a">
                        <!-- Injected Track A awards -->
                    </div>
                </div>

                <!-- Track B POC Results inside Demo Tab -->
                <div class="not-prose mt-10 space-y-6 border-t border-slate-200/60 pt-8">
                    <h3 class="text-base font-extrabold text-slate-800 mb-4 border-l-4 border-indigo-600 pl-2">
                        🎙️ B軌聲音決選參考 (POC 成果)
                    </h3>
                    
                    <!-- Overall Summary Card -->
                    <div class="bg-gradient-to-r from-indigo-600 to-purple-700 p-6 rounded-2xl text-white shadow-md mb-6 space-y-2">
                        <h4 class="text-sm font-extrabold flex items-center text-white">
                            <span class="text-lg mr-2">🔮</span> 評審團聲音評選綜合總評
                        </h4>
                        <p id="poc-overall-summary-b" class="text-xs text-blue-50 leading-relaxed font-medium" style="color: #eff6ff !important;">
                            <!-- Injected summary -->
                        </p>
                    </div>

                    <!-- Voice Diagnostics Comparison Chart -->
                    <div id="voice-analysis-chart-card" class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center mb-6 hidden">
                        <h3 class="text-sm font-extrabold text-slate-700 mb-2 self-start border-l-4 border-indigo-500 pl-2">
                            聲音物理評估對比 (平均語速 vs 贅字頻率)
                        </h3>
                        <p class="text-xs text-slate-500 mb-4 self-start">
                            呈現 9 個抽樣單集的平均語速（WPM，柱狀圖，對應左軸）與贅字頻率等級（低/中/高，折線圖，對應右軸，點位越高代表口條越流暢、贅字越少）。
                        </p>
                        <div class="w-full h-[320px] flex items-center justify-center">
                            <canvas id="voiceChart"></canvas>
                        </div>
                    </div>

                    <!-- Track B Awards container -->
                    <div class="space-y-6 mb-8" id="poc-awards-container-track-b">
                        <!-- Injected Track B awards -->
                    </div>

                    <!-- Voice Diagnostics Details Grid (9 episodes) -->
                    <h3 class="text-base font-extrabold text-slate-800 mb-4 border-l-4 border-emerald-600 pl-2">
                        🔍 聲音物理評估詳情 (9集 POC 深入分析)
                    </h3>
                    <div class="grid grid-cols-1 gap-4" id="voice-diagnostics-list">
                        <!-- Dynamic list of voice diagnostics for all 9 episodes -->
                    </div>
                </div>
            </div>

            <!-- Eligibility Tab Content -->
            <div id="content-eligibility" class="prose max-w-none hidden">
                <!-- Status metrics & charts will be dynamically prepended here -->
                <div id="eligibility-dashboard" class="not-prose mb-8">
                    <!-- Metrics cards -->
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div class="bg-blue-50/50 p-4 rounded-xl border border-blue-100 shadow-sm flex flex-col justify-between">
                            <div>
                                <div class="text-xs text-blue-800 font-bold tracking-wide">合作總KOL數量</div>
                                <div class="text-2xl font-black text-slate-800 mt-1">${totalKols} 檔</div>
                            </div>
                            <div class="text-[11px] text-blue-600 font-semibold mt-1">
                                (其中 ${hasPodcastCount} 檔有 Podcast)
                            </div>
                        </div>
                        <div class="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 shadow-sm flex flex-col justify-between">
                            <div>
                                <div class="text-xs text-emerald-800 font-bold tracking-wide">審查合格節目</div>
                                <div class="text-2xl font-black text-emerald-600 mt-1">${stats.summary.eligiblePrograms} 檔</div>
                            </div>
                            <div class="text-[11px] text-emerald-600 font-semibold mt-1">
                                (發片集數 &ge; 12 集)
                            </div>
                        </div>
                        <div class="bg-rose-50/50 p-4 rounded-xl border border-rose-100 shadow-sm flex flex-col justify-between">
                            <div>
                                <div class="text-xs text-rose-800 font-bold tracking-wide">不符合資格數量</div>
                                <div class="text-2xl font-black text-rose-500 mt-1">${stats.summary.ineligiblePrograms} 檔</div>
                            </div>
                            <div class="text-[10px] text-rose-600 font-semibold mt-1 leading-tight">
                                (${insufficientCount} 檔發片不足，${noPodcastCount} 檔無 Podcast)
                            </div>
                        </div>
                        <div class="bg-amber-50/50 p-4 rounded-xl border border-amber-100 shadow-sm flex flex-col justify-between">
                            <div>
                                <div class="text-xs text-amber-800 font-bold tracking-wide">收錄合格單集</div>
                                <div class="text-2xl font-black text-amber-600 mt-1">${stats.summary.totalEpisodes} 集</div>
                            </div>
                            <div class="text-[11px] text-amber-600 font-semibold mt-1">
                                (已寫入單集池頁籤)
                            </div>
                        </div>
                    </div>
                    
                    <!-- Charts grid -->
                    <div class="grid grid-cols-1 md:grid-cols-12 gap-6 my-8">
                        <div class="md:col-span-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                            <h3 class="text-sm font-extrabold text-slate-700 mb-4 self-start border-l-4 border-emerald-500 pl-2">KOL 節目審查合格率</h3>
                            <div class="w-full h-[220px] flex items-center justify-center">
                                <canvas id="pieChart"></canvas>
                            </div>
                        </div>
                        <div class="md:col-span-8 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                            <h3 class="text-sm font-extrabold text-slate-700 mb-4 self-start border-l-4 border-blue-500 pl-2">KOL 節目發片量排行 (前 15 名)</h3>
                            <div class="w-full h-[220px] flex items-center justify-center">
                                <canvas id="barChart"></canvas>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Eligibility Markdown content will render here -->
                <div id="eligibility-markdown-content"></div>
            </div>

<div id="content-timeline" class="prose max-w-none hidden">
                <!-- Timeline Markdown renders here -->
            </div>
            
            <div id="content-deploy" class="prose max-w-none hidden">
                <!-- Deploy Markdown renders here -->
            </div>
        </div>

        <!-- Track C Content -->
        <div id="content-track-c" class="hidden w-full space-y-6">
            <!-- Rankings section -->
            <div class="glass-card rounded-2xl p-6 sm:p-10">
                <h3 class="text-sm font-extrabold text-slate-700 mb-4 border-l-4 border-rose-500 pl-2">
                    Apple Podcast 霸榜歷史排行走勢 (曾入榜 KOL)
                </h3>
                <p class="text-xs text-slate-500 mb-4">
                    統計自收錄起點 (2026-06-14) 迄今，KOL 節目在 Apple Podcast 台灣每日熱門 Top 100 總榜的名次波動走勢（名次越往上方表示排行越高，若當日未入榜則不顯示點位）。
                </p>
                <div class="w-full h-[320px] mb-6">
                    <canvas id="lineChart"></canvas>
                </div>
                
                <h3 class="text-sm font-extrabold text-slate-700 mb-3 border-l-4 border-amber-500 pl-2">
                    KOL 霸榜詳細數據表
                </h3>
                <div class="overflow-x-auto border border-slate-100 rounded-xl">
                    <table class="min-w-full divide-y divide-slate-200 text-xs sm:text-sm">
                        <thead class="bg-slate-50/70">
                            <tr>
                                <th class="px-3 py-2 text-left font-bold text-slate-700">名次</th>
                                <th class="px-3 py-2 text-left font-bold text-slate-700">合作夥伴</th>
                                <th class="px-3 py-2 text-left font-bold text-slate-700">節目名稱</th>
                                <th class="px-3 py-2 text-center font-bold text-slate-700">在榜天數</th>
                                <th class="px-3 py-2 text-center font-bold text-slate-700">在榜率</th>
                                <th class="px-3 py-2 text-center font-bold text-slate-700">平均排名</th>
                                <th class="px-3 py-2 text-center font-bold text-slate-700">最佳排名</th>
                                <th class="px-3 py-2 text-left font-bold text-slate-700">歷史名次軌跡</th>
                            </tr>
                        </thead>
                        <tbody id="leaderboard-tbody" class="divide-y divide-slate-100 bg-white">
                            <!-- Dynamic rows -->
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Original Iframe -->
            <div class="glass-card rounded-2xl p-6 sm:p-10">
                <h3 class="text-sm font-extrabold text-slate-700 mb-4 border-l-4 border-blue-500 pl-2">
                    KOL 社群聲量與評選建議 (Meta.AI 完整報告)
                </h3>
                <iframe src="Meta.AI/Podcast聲量評選建議.html" class="w-full h-[85vh] border-0 rounded-xl bg-[#fdf9f5]"></iframe>
            </div>
        </div>

        <footer class="text-center text-xs text-slate-500 mt-10">
            此網頁為免伺服器、全自包含靜態檔案。可直接將此 HTML 檔案寄送或分享給團隊成員，雙擊即可在瀏覽器完美閱讀。
        </footer>
    </div>

    <!-- Hidden Raw Markdown Data Source -->
    <textarea id="markdown-source" class="hidden">${mdContent.replace(/<\/textarea>/g, '&lt;/textarea&gt;')}</textarea>

    <!-- Injected JSON Statistics -->
    <script>
        window.eligibilityStats = ${JSON.stringify(stats)};
        window.pocResults = ${JSON.stringify(pocResults)};
        window.selectedEpisodes = ${JSON.stringify(selectedEpisodes)};
        window.trackBResults = ${JSON.stringify(trackBResults)};
    </script>

    <script>
        // Configure marked.js
        marked.setOptions({
            breaks: true,
            gfm: true
        });

        // Initialize Mermaid with Default theme
        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose',
            flowchart: {
                useMaxWidth: true,
                htmlLabels: true
            }
        });

        // Tab Switching Logic
        function switchTab(tabId) {
            // Update URL hash without scrolling jump
            if (window.location.hash !== '#' + tabId) {
                history.replaceState(null, null, '#' + tabId);
            }
            
            const planBtn = document.getElementById('tab-btn-plan');
            const eligibilityBtn = document.getElementById('tab-btn-eligibility');
            const demoBtn = document.getElementById('tab-btn-demo');
            const trackCBtn = document.getElementById('tab-btn-track-c');
            const timelineBtn = document.getElementById('tab-btn-timeline');
            const deployBtn = document.getElementById('tab-btn-deploy');
            
            const mainGlassCard = document.getElementById('main-glass-card');
            const planContent = document.getElementById('content-plan');
            const eligibilityContent = document.getElementById('content-eligibility');
            const demoContent = document.getElementById('content-demo');
            const trackCContent = document.getElementById('content-track-c');
            const timelineContent = document.getElementById('content-timeline');
            const deployContent = document.getElementById('content-deploy');

            const activeBtnClass = "flex-1 py-2 text-center text-[11px] sm:text-xs font-bold rounded-lg transition-all duration-200 bg-white text-blue-600 shadow-sm border border-slate-200/10";
            const inactiveBtnClass = "flex-1 py-2 text-center text-[11px] sm:text-xs font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50";

            planBtn.className = inactiveBtnClass;
            if (eligibilityBtn) eligibilityBtn.className = inactiveBtnClass;
            if (demoBtn) demoBtn.className = inactiveBtnClass;
            if (trackCBtn) trackCBtn.className = inactiveBtnClass;
            timelineBtn.className = inactiveBtnClass;
            deployBtn.className = inactiveBtnClass;

            planContent.classList.add('hidden');
            if (eligibilityContent) eligibilityContent.classList.add('hidden');
            if (demoContent) demoContent.classList.add('hidden');
            if (trackCContent) trackCContent.classList.add('hidden');
            timelineContent.classList.add('hidden');
            deployContent.classList.add('hidden');
            mainGlassCard.classList.add('hidden');

            if (tabId === 'plan') {
                planBtn.className = activeBtnClass;
                mainGlassCard.classList.remove('hidden');
                planContent.classList.remove('hidden');
            } else if (tabId === 'eligibility' && eligibilityContent) {
                eligibilityBtn.className = activeBtnClass;
                mainGlassCard.classList.remove('hidden');
                eligibilityContent.classList.remove('hidden');
                renderCharts(); // Render Chart.js charts on show
            } else if (tabId === 'demo' && demoContent) {
                demoBtn.className = activeBtnClass;
                mainGlassCard.classList.remove('hidden');
                demoContent.classList.remove('hidden');
                renderCharts(); // Render voice Chart on show (since voice Chart is now in Demo tab!)
            } else if (tabId === 'track-c' && trackCContent) {
                trackCBtn.className = activeBtnClass;
                trackCContent.classList.remove('hidden');
                renderCharts(); // Render Chart.js charts on show
            } else if (tabId === 'deploy') {
                deployBtn.className = activeBtnClass;
                mainGlassCard.classList.remove('hidden');
                deployContent.classList.remove('hidden');
            } else {
                timelineBtn.className = activeBtnClass;
                mainGlassCard.classList.remove('hidden');
                timelineContent.classList.remove('hidden');
            }
        }

        // Global charts instances to prevent canvas reuse errors
        let pieChartInstance = null;
        let barChartInstance = null;
        let lineChartInstance = null;
        let voiceChartInstance = null;

        function renderVoiceChart() {
            const voiceCanvas = document.getElementById('voiceChart');
            if (!voiceCanvas || voiceCanvas.offsetParent === null) return;

            const trackB = window.trackBResults || {};
            const items = Object.values(trackB);
            if (items.length === 0) return;

            // Unhide the voice analysis chart card
            const voiceCard = document.getElementById('voice-analysis-chart-card');
            if (voiceCard) voiceCard.classList.remove('hidden');

            if (voiceChartInstance) voiceChartInstance.destroy();
            const voiceCtx = voiceCanvas.getContext('2d');

            // Sort items by partnerName to group them
            items.sort((a, b) => a.partnerName.localeCompare(b.partnerName, 'zh-Hant'));

            const labels = items.map(item => {
                const shortTitle = item.title.length > 15 ? item.title.slice(0, 15) + '...' : item.title;
                return \`\${item.partnerName}\\n(\${shortTitle})\`;
            });

            const wpmData = items.map(item => item.speech_rate_wpm);
            const levelMap = { '低': 3, '中': 2, '高': 1 };
            const fillerData = items.map(item => levelMap[item.filler_words_level] || 2);

            voiceChartInstance = new Chart(voiceCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: '平均語速 (WPM)',
                            data: wpmData,
                            backgroundColor: 'rgba(99, 102, 241, 0.8)', // Semi-transparent Indigo
                            borderColor: '#4f46e5',
                            borderWidth: 1.5,
                            yAxisID: 'y',
                            order: 2,
                            borderRadius: 6
                        },
                        {
                            label: '贅字頻率等級',
                            data: fillerData,
                            type: 'line',
                            borderColor: '#f59e0b', // Amber
                            backgroundColor: '#f59e0b',
                            borderWidth: 3,
                            pointRadius: 6,
                            pointHoverRadius: 8,
                            yAxisID: 'y1',
                            order: 1,
                            tension: 0.2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            min: 150,
                            max: 300,
                            title: {
                                display: true,
                                text: '平均語速 (字/分)',
                                font: { family: 'Noto Sans TC', size: 11, weight: 'bold' }
                            },
                            grid: { color: '#f1f5f9' },
                            ticks: {
                                font: { family: 'Noto Sans TC', size: 10 }
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            min: 0.5,
                            max: 3.5,
                            grid: { drawOnChartArea: false },
                            title: {
                                display: true,
                                text: '贅字頻率 (低表示贅字少/口條好)',
                                font: { family: 'Noto Sans TC', size: 11, weight: 'bold' }
                            },
                            ticks: {
                                stepSize: 1,
                                callback: function(value) {
                                    const labelsMap = { 3: '低 (優)', 2: '中', 1: '高 (多)' };
                                    return labelsMap[value] || '';
                                },
                                font: { family: 'Noto Sans TC', size: 10 }
                            }
                        },
                        x: {
                            grid: { display: false },
                            ticks: {
                                font: { family: 'Noto Sans TC', size: 9 },
                                maxRotation: 45,
                                minRotation: 45
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: {
                                font: { family: 'Noto Sans TC', size: 11, weight: 'bold' }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.datasetIndex === 0) {
                                        label += context.raw + ' WPM';
                                    } else {
                                        const valMap = { 3: '低 (贅字少，口條好)', 2: '中 (贅字頻率一般)', 1: '高 (贅字較多)' };
                                        label += valMap[context.raw] || context.raw;
                                    }
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
        }

        function renderCharts() {
            const stats = window.eligibilityStats;
            if (!stats || !stats.summary || stats.summary.totalPrograms === 0) return;

            // Render Status Tab Charts (Pie & Bar) only when visible in DOM
            const pieCanvas = document.getElementById('pieChart');
            if (pieCanvas && pieCanvas.offsetParent !== null) {
                // Render Pie Chart
                if (pieChartInstance) pieChartInstance.destroy();
                const pieCtx = pieCanvas.getContext('2d');
                
                pieChartInstance = new Chart(pieCtx, {
                    type: 'pie',
                    data: {
                        labels: ['合格 (>=12集)', '不合格 (<12集/無節目)'],
                        datasets: [{
                            data: [stats.summary.eligiblePrograms, stats.summary.ineligiblePrograms],
                            backgroundColor: ['#10b981', '#f43f5e'], // Emerald Green and Rose Red
                            borderColor: '#ffffff',
                            borderWidth: 2
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    boxWidth: 12,
                                    font: { family: 'Noto Sans TC', size: 11, weight: 'bold' }
                                }
                            }
                        }
                    }
                });

                // Render Bar Chart
                const barCanvas = document.getElementById('barChart');
                if (barCanvas) {
                    if (barChartInstance) barChartInstance.destroy();
                    const barCtx = barCanvas.getContext('2d');

                    // Sort programs by count descending and take top 15
                    const topPrograms = [...stats.programs]
                        .sort((a, b) => b.episodesCount - a.episodesCount)
                        .slice(0, 15);

                    barChartInstance = new Chart(barCtx, {
                        type: 'bar',
                        data: {
                            labels: topPrograms.map(p => p.partnerName),
                            datasets: [{
                                label: '發片集數',
                                data: topPrograms.map(p => p.episodesCount),
                                backgroundColor: topPrograms.map(p => p.eligible ? '#3b82f6' : '#cbd5e1'), // Sky Blue or Light Gray
                                borderRadius: 6
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                y: {
                                    beginAtZero: true,
                                    grid: { color: '#f1f5f9' },
                                    ticks: { font: { family: 'Noto Sans TC', size: 10 } }
                                },
                                x: {
                                    grid: { display: false },
                                    ticks: {
                                        font: { family: 'Noto Sans TC', size: 9 },
                                        maxRotation: 45,
                                        minRotation: 45
                                    }
                                }
                            },
                            plugins: {
                                font: { family: 'Noto Sans TC' },
                                legend: { display: false },
                                tooltip: {
                                    callbacks: {
                                        title: (tooltipItems) => {
                                            const index = tooltipItems[0].dataIndex;
                                            return topPrograms[index].podcastName;
                                        },
                                        label: (tooltipItem) => {
                                            const count = tooltipItem.raw;
                                            return ' 發片量: ' + count + ' 集';
                                        }
                                    }
                                }
                            }
                        }
                    });
                }
            }

            // Render Track C Tab Chart (Line Chart & Leaderboard Table) only when visible in DOM
            const lineCanvas = document.getElementById('lineChart');
            if (lineCanvas && lineCanvas.offsetParent !== null) {
                if (lineChartInstance) lineChartInstance.destroy();
                const lineCtx = lineCanvas.getContext('2d');

                const dates = stats.dates || [];
                const leaderboard = stats.leaderboard || [];

                // Define colors for the lines
                const lineColors = [
                    '#E8452A', // Brand Red
                    '#2a7de1', // Brand Blue
                    '#10b981', // Emerald Green
                    '#e56b1f', // Brand Orange
                    '#8b5cf6', // Violet
                    '#f59e0b', // Amber
                    '#ec4899', // Pink
                    '#06b6d4'  // Cyan
                ];

                const datasets = leaderboard.map((item, idx) => {
                    const dataPoints = dates.map(date => {
                        return item.history[date] !== undefined ? item.history[date] : null;
                    });

                    return {
                        label: item.partnerName,
                        data: dataPoints,
                        borderColor: lineColors[idx % lineColors.length],
                        backgroundColor: lineColors[idx % lineColors.length],
                        borderWidth: 3,
                        tension: 0.1,
                        spanGaps: false, // Don't bridge gaps where not on chart
                        pointRadius: 5,
                        pointHoverRadius: 7
                    };
                });

                lineChartInstance = new Chart(lineCtx, {
                    type: 'line',
                    data: {
                        labels: dates.map(d => d.slice(5)), // "MM-DD"
                        datasets: datasets
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                reverse: true,
                                min: 1,
                                max: 100,
                                title: {
                                    display: true,
                                    text: '名次 (越往上名次越高)',
                                    font: { family: 'Noto Sans TC', size: 11, weight: 'bold' }
                                },
                                grid: { color: '#e2e8f0' },
                                ticks: {
                                    font: { family: 'Noto Sans TC', size: 10 },
                                    stepSize: 10
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: '日期',
                                    font: { family: 'Noto Sans TC', size: 11, weight: 'bold' }
                                },
                                grid: { color: '#f1f5f9' },
                                ticks: {
                                    font: { family: 'Noto Sans TC', size: 10 }
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    boxWidth: 12,
                                    font: { family: 'Noto Sans TC', size: 11, weight: 'bold' }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: (context) => {
                                        const value = context.raw;
                                        return ' ' + context.dataset.label + ': #' + value;
                                    }
                                }
                            }
                        }
                    }
                });

                // Render Leaderboard Table
                const tbody = document.getElementById('leaderboard-tbody');
                if (tbody) {
                    tbody.innerHTML = '';
                    if (leaderboard.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-slate-400">目檔無在榜數據</td></tr>';
                    } else {
                        leaderboard.forEach((item, idx) => {
                            const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : (idx + 1).toString();
                            const presenceRate = stats.summary.archivedDatesCount ? (Math.round((item.daysOnChart / stats.summary.archivedDatesCount) * 100) + '%') : "0%";

                            const tr = document.createElement('tr');
                            tr.className = "hover:bg-slate-50 transition-colors";
                            tr.innerHTML = \`
                                <td class="px-3 py-2.5 text-left font-bold text-slate-800">\${medal}</td>
                                <td class="px-3 py-2.5 text-left font-semibold text-slate-900">\${item.partnerName}</td>
                                <td class="px-3 py-2.5 text-left text-slate-700">
                                    <a href="\${item.applePodcastUrl}" target="_blank" class="text-blue-600 hover:underline font-medium">\${item.podcastName}</a>
                                </td>
                                <td class="px-3 py-2.5 text-center font-bold text-emerald-600">\${item.daysOnChart}</td>
                                <td class="px-3 py-2.5 text-center font-semibold text-slate-600">\${presenceRate}</td>
                                <td class="px-3 py-2.5 text-center font-semibold text-blue-600">#\${item.avgRank}</td>
                                <td class="px-3 py-2.5 text-center font-bold text-rose-500">#\${item.bestRank}</td>
                                <td class="px-3 py-2.5 text-left text-slate-500 text-xs font-mono">\${item.details}</td>
                            \`;
                            tbody.appendChild(tr);
                        });
                    }
                }
            }

            // Render Track B Tab Chart (Voice Chart) only when visible in DOM
            const voiceCanvas = document.getElementById('voiceChart');
            if (voiceCanvas && voiceCanvas.offsetParent !== null) {
                renderVoiceChart();
            }
        }
        document.addEventListener('DOMContentLoaded', async () => {
            const rawMarkdown = document.getElementById('markdown-source').value;
            const parts = rawMarkdown.split('<!-- tab-split -->');
            const planMd = parts[0] || '';
            const eligibilityMd = parts[1] || '';
            const timelineMd = parts[2] || '';
            const deployMd = parts[3] || '';
            
            // Render Plan Markdown
            const planHtml = marked.parse(planMd);
            const planContainer = document.getElementById('content-plan');
            planContainer.innerHTML = planHtml;

            // Render Eligibility Markdown
            const eligibilityHtml = marked.parse(eligibilityMd);
            const eligibilityContainer = document.getElementById('content-eligibility');
            const eligibilityContentDiv = document.getElementById('eligibility-markdown-content');
            if (eligibilityContentDiv) eligibilityContentDiv.innerHTML = eligibilityHtml;

            // Render Timeline Markdown
            const timelineHtml = marked.parse(timelineMd);
            const timelineContainer = document.getElementById('content-timeline');
            timelineContainer.innerHTML = timelineHtml;

            // Render Deploy Markdown
            const deployHtml = marked.parse(deployMd);
            const deployContainer = document.getElementById('content-deploy');
            deployContainer.innerHTML = deployHtml;

            // Find and convert Mermaid blocks in all containers
            [planContainer, eligibilityContainer, document.getElementById('content-demo'), timelineContainer, deployContainer].forEach(container => {
                const codeBlocks = container.querySelectorAll('pre code');
                codeBlocks.forEach(codeBlock => {
                    if (codeBlock.classList.contains('language-mermaid')) {
                        const preElement = codeBlock.parentElement;
                        const mermaidDiv = document.createElement('div');
                        mermaidDiv.className = 'mermaid my-8 p-4 bg-slate-50 rounded-xl border border-slate-200 overflow-x-auto';
                        mermaidDiv.textContent = codeBlock.textContent;
                        preElement.replaceWith(mermaidDiv);
                    }
                });
            });

            // Run Mermaid rendering
            try {
                await mermaid.run();
            } catch (err) {
                console.error("Mermaid 渲染出錯:", err);
            }

            // Render POC Results in dashboard if available
            const pocResults = window.pocResults;
            const selectedEpisodes = window.selectedEpisodes;
            const pocDashboard = document.getElementById('poc-dashboard');
            
            if (pocResults && selectedEpisodes && pocDashboard) {
                pocDashboard.classList.remove('hidden');
                
                // 1. Render Episode List
                let epListHtml = '';
                const targetPartners = ["郝旭烈/郝聲音", "五吉郎", "哇賽心理學_蔡宇哲"];
                targetPartners.forEach(partner => {
                    const eps = selectedEpisodes.filter(e => e.partnerName === partner);
                    epListHtml += \`
                        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                            <div>
                                <div class="text-sm font-bold text-slate-800 border-b pb-2 mb-3 flex justify-between items-center">
                                    <span>🎙️ \${partner}</span>
                                    <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">3集隨機抽樣</span>
                                </div>
                                <ul class="space-y-3 text-xs text-slate-600">
                    \`;
                    eps.forEach((ep, idx) => {
                        let segsHtml = '';
                        if (ep.recommended_segments && ep.recommended_segments.length > 0) {
                            segsHtml += '<div class="pl-4 mt-2 border-l-2 border-slate-100 space-y-1.5 text-[10px] text-slate-500">';
                            ep.recommended_segments.forEach(seg => {
                                segsHtml += \`
                                    <div class="py-0.5">
                                        <span class="font-mono font-bold text-emerald-700 bg-emerald-50 px-1 rounded mr-1">\${seg.time_range}</span>
                                        <span class="font-semibold text-slate-700">\${seg.title}</span>
                                        <span class="text-slate-500">— \${seg.reason}</span>
                                    </div>
                                \`;
                            });
                            segsHtml += '</div>';
                        }
                        epListHtml += \`
                                    <li class="border-b border-slate-100 last:border-0 pb-2 mb-2 last:pb-0 last:mb-0">
                                        <div class="font-semibold text-slate-800 leading-relaxed">
                                            <span class="font-bold text-blue-600">\${idx+1}.</span> \${ep.title}
                                        </div>
                                        \${segsHtml}
                                    </li>
                        \`;
                    });
                    epListHtml += \`
                                </ul>
                            </div>
                        </div>
                    \`;
                });
                document.getElementById('poc-episodes-list').innerHTML = epListHtml;
                
                // 2. Render Awards Table (Split by Track A / Track B)
                let awardsHtmlTrackA = '';
                let awardsHtmlTrackB = '';
                
                const trackAKeys = ["content_structure", "episode_planning", "best_cta", "niche_market", "self_exploration", "best_long_form", "best_short_form"];
                const trackBKeys = ["best_duo_hosts", "best_male_host", "best_female_host", "atmosphere"];

                const awardsKeys = Object.keys(pocResults.awards);
                awardsKeys.forEach(key => {
                    const aw = pocResults.awards[key];
                    
                    // Get rows for the 3 partners in this award
                    let partnerRows = '';
                    aw.ranking.forEach(r => {
                        const medal = r.rank === 1 ? '🥇 金獎' : r.rank === 2 ? '🥈 銀獎' : '🥉 銅獎';
                        const medalColor = r.rank === 1 ? 'text-amber-500' : r.rank === 2 ? 'text-slate-400' : 'text-amber-700';
                        const scoreText = r.score !== null ? \`\${r.score} 分\` : 'N/A';
                        
                        const isCompliant = r.compliance === '符合';
                        const isNa = r.compliance === '不適用' || r.compliance === 'N/A';
                        const badgeClass = isCompliant ? 'bg-emerald-100 text-emerald-700' : isNa ? 'bg-slate-100 text-slate-500' : 'bg-rose-100 text-rose-700';
                        const badgeText = r.compliance || '符合';
                        
                        partnerRows += \`
                            <tr class="hover:bg-slate-50/50">
                                <td class="px-3 py-2.5 whitespace-nowrap text-xs font-bold \${medalColor}">\${medal}</td>
                                <td class="px-3 py-2.5 whitespace-nowrap text-xs font-semibold text-slate-800">\${r.partnerName}</td>
                                <td class="px-3 py-2.5 whitespace-nowrap text-xs font-bold text-blue-600">\${scoreText}</td>
                                <td class="px-3 py-2.5 whitespace-nowrap text-xs">
                                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold \${badgeClass}">\${badgeText}</span>
                                </td>
                                <td class="px-3 py-2.5 text-xs text-slate-600 leading-relaxed">\${r.reason}</td>
                            </tr>
                        \`;
                    });
                    
                    const singleAwardHtml = \`
                        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                            <div class="flex justify-between items-center border-b pb-3">
                                <h4 class="text-sm font-extrabold text-slate-800 flex items-center">
                                    <span class="text-lg mr-2">🏅</span> \${aw.award_name}
                                </h4>
                            </div>
                            <div class="overflow-x-auto">
                                <table class="min-w-full divide-y divide-slate-100 text-left">
                                    <thead class="bg-slate-50/50 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                        <tr>
                                            <th class="px-3 py-2">獎項名次</th>
                                            <th class="px-3 py-2">合作夥伴</th>
                                            <th class="px-3 py-2">打分</th>
                                            <th class="px-3 py-2">符合定義</th>
                                            <th class="px-3 py-2">評分說明</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-slate-100 bg-white">
                                        \${partnerRows}
                                    </tbody>
                                </table>
                            </div>
                            <div class="bg-blue-50/40 p-3.5 rounded-xl border border-blue-100/50 text-xs text-slate-700 leading-relaxed">
                                <span class="font-bold text-blue-800">🔍 橫向 PK 對手對比：</span>\${aw.comparative_analysis}
                            </div>
                        </div>
                    \`;

                    if (trackAKeys.includes(key)) {
                        awardsHtmlTrackA += singleAwardHtml;
                    } else if (trackBKeys.includes(key)) {
                        awardsHtmlTrackB += singleAwardHtml;
                    }
                });

                document.getElementById('poc-awards-container-track-a').innerHTML = awardsHtmlTrackA;
                document.getElementById('poc-awards-container-track-b').innerHTML = awardsHtmlTrackB;
                
                // 3. Render Overall Summary
                document.getElementById('poc-overall-summary-a').textContent = pocResults.overall_summary;
                document.getElementById('poc-overall-summary-b').textContent = pocResults.overall_summary;
            }

            // Render Voice Diagnostics Details list (9 episodes)
            const trackBData = window.trackBResults || {};
            const voiceDiagContainer = document.getElementById('voice-diagnostics-list');
            if (voiceDiagContainer && Object.keys(trackBData).length > 0) {
                let voiceDiagHtml = '';
                const items = Object.values(trackBData);
                // Sort by partnerName, then by title
                items.sort((a, b) => {
                    const compPartner = a.partnerName.localeCompare(b.partnerName, 'zh-Hant');
                    if (compPartner !== 0) return compPartner;
                    return a.title.localeCompare(b.title, 'zh-Hant');
                });

                items.forEach((item, idx) => {
                    // Styling for filler words level
                    let fillerBadge = '';
                    if (item.filler_words_level === '低') {
                        fillerBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">低 (優，贅字極少)</span>';
                    } else if (item.filler_words_level === '中') {
                        fillerBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">中 (一般)</span>';
                    } else {
                        fillerBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">高 (贅字多)</span>';
                    }

                    // Styling for speech rate wpm
                    let wpmBadge = '';
                    if (item.speech_rate_wpm >= 200 && item.speech_rate_wpm <= 240) {
                        wpmBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">' + item.speech_rate_wpm + ' WPM (適中)</span>';
                    } else if (item.speech_rate_wpm > 240) {
                        wpmBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">' + item.speech_rate_wpm + ' WPM (偏快)</span>';
                    } else {
                        wpmBadge = '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">' + item.speech_rate_wpm + ' WPM (較慢)</span>';
                    }

                    // Acoustic quality badge
                    const acBadgeClass = item.acoustic_quality_level === '優' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700';
                    const acBadgeText = '🔊 收音: ' + item.acoustic_quality_level;

                    voiceDiagHtml += \`
                        <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 hover:border-slate-300 transition-all duration-200">
                            <!-- Header -->
                            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b pb-3 space-y-2 sm:space-y-0">
                                <div class="flex items-center space-x-2.5">
                                    <span class="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-bold border border-slate-200/50">#\${idx+1}</span>
                                    <span class="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg border border-indigo-100/50">🎙️ \${item.partnerName} (\${item.podcastName})</span>
                                </div>
                                <span class="self-start sm:self-auto px-2.5 py-1 rounded-full text-xs font-bold \${acBadgeClass}">\${acBadgeText}</span>
                            </div>
                            
                            <!-- Episode Title -->
                            <h4 class="text-sm font-extrabold text-slate-800 leading-relaxed">
                                \${item.title}
                            </h4>
                            
                            <!-- 2-Column Detail Grid -->
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                                <!-- Column 1: Voice Physical Properties -->
                                <div class="space-y-3.5 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                    <div class="text-xs font-bold text-indigo-900 border-b border-indigo-100/50 pb-1.5 flex items-center">
                                        <span class="mr-1.5">🎙️</span> 口條與發聲物理分析
                                    </div>
                                    <div class="space-y-2.5 text-xs">
                                        <div class="flex items-center justify-between">
                                            <span class="text-slate-500 font-medium">平均語速:</span>
                                            \${wpmBadge}
                                        </div>
                                        <div class="flex items-center justify-between">
                                            <span class="text-slate-500 font-medium">贅字贅詞頻率:</span>
                                            \${fillerBadge}
                                        </div>
                                        <div class="space-y-1 mt-1 text-slate-600 leading-relaxed">
                                            <span class="font-bold text-slate-700 block">💬 贅字表現分析：</span>
                                            \${item.filler_words_analysis}
                                        </div>
                                        <div class="space-y-1 pt-1.5 text-slate-600 leading-relaxed border-t border-dashed border-slate-200/80">
                                            <span class="font-bold text-slate-700 block">📢 音色共鳴與咬字：</span>
                                            \${item.vocal_resonance}
                                        </div>
                                    </div>
                                </div>

                                <!-- Column 2: Acoustic Quality & Golden Segment -->
                                <div class="space-y-3.5 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                    <div class="text-xs font-bold text-emerald-900 border-b border-emerald-100/50 pb-1.5 flex items-center">
                                        <span class="mr-1.5">🔊</span> 收音環境與金聽片段
                                    </div>
                                    <div class="space-y-2.5 text-xs">
                                        <div class="space-y-1 text-slate-600 leading-relaxed">
                                            <span class="font-bold text-slate-700 block">🎧 錄音環境與背景：</span>
                                            \${item.acoustic_summary}
                                        </div>
                                        <div class="grid grid-cols-3 gap-2 py-1 text-[11px] font-bold text-slate-600 border-y border-dashed border-slate-200/80 my-2">
                                            <div class="text-center bg-slate-100 rounded py-0.5">💥 爆音: \${item.acoustic_issues_popping}</div>
                                            <div class="text-center bg-slate-100 rounded py-0.5">✂️ 破音: \${item.acoustic_issues_clipping}</div>
                                            <div class="text-center bg-slate-100 rounded py-0.5">🔇 底噪: \${item.acoustic_issues_noise}</div>
                                        </div>
                                        <div class="space-y-1 pt-0.5 text-slate-600 leading-relaxed">
                                            <span class="font-bold text-slate-700 block flex items-center justify-between">
                                                <span>⭐ 評審推薦金聽片段：</span>
                                                <span class="font-mono font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">\${item.golden_segment_time}</span>
                                            </span>
                                            \${item.golden_segment_reason}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    \`;
                });
                voiceDiagContainer.innerHTML = voiceDiagHtml;
            }
// Handle initial hash routing after markdown and mermaid are fully ready
            const initialHash = window.location.hash.slice(1);
            if (['plan', 'eligibility', 'demo', 'track-c', 'timeline', 'deploy'].includes(initialHash)) {
                switchTab(initialHash);
            }
        });

        // Listen for history back/forward hash changes
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.slice(1);
            if (['plan', 'eligibility', 'demo', 'track-c', 'timeline', 'deploy'].includes(hash)) {
                switchTab(hash);
            }
        });
    </script>
</body>
</html>`;

    const outputPath = path.join(__dirname, 'podcast_evaluation_workflow.html');
    fs.writeFileSync(outputPath, htmlTemplate, 'utf-8');
    console.log(`已成功將規劃書與軌道 C (Meta.AI 聲量評選建議) 整合轉換為白底網頁版（含 Chart.js 可視化）：${outputPath}`);
}

generateSelfContainedHtml();

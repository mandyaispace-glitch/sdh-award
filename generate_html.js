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
    
    // Calculate custom breakdown values for cooperative KOLs
    const noPodcastCount = stats.programs.filter(p => p.reason && p.reason.includes('無 Podcast')).length;
    const insufficientCount = stats.programs.filter(p => p.reason && p.reason.includes('不足')).length;
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
                更新時間: 2026-06-17 | 設計者: Antigravity
            </div>
        </header>

        <!-- Tab Navigation -->
        <div class="flex space-x-2 p-1.5 bg-slate-200/50 backdrop-blur-md rounded-xl mb-6 max-w-2xl shadow-inner border border-slate-200/30">
            <a id="tab-btn-plan" href="#plan" class="flex-1 py-2.5 text-center text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 bg-white text-blue-600 shadow-sm border border-slate-200/10" onclick="switchTab('plan'); return false;">
                📄 評選工作流規劃
            </a>
            <a id="tab-btn-status" href="#status" class="flex-1 py-2.5 text-center text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50" onclick="switchTab('status'); return false;">
                📌 專案執行現況
            </a>
            ${hasTrackC ? `
            <a id="tab-btn-track-c" href="#track-c" class="flex-1 py-2.5 text-center text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50" onclick="switchTab('track-c'); return false;">
                📊 軌道 C 社群聲量
            </a>
            ` : ''}
            <a id="tab-btn-timeline" href="#timeline" class="flex-1 py-2.5 text-center text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50" onclick="switchTab('timeline'); return false;">
                ⏳ 專案進程時間軸
            </a>
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
            
            <div id="content-status" class="prose max-w-none hidden">
                <!-- Status metrics & charts will be dynamically prepended here -->
                <div id="status-dashboard" class="not-prose mb-8">
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
                
                <!-- Status Markdown content will render here -->
                <div id="status-markdown-content"></div>
            </div>
            
            <div id="content-timeline" class="prose max-w-none hidden">
                <!-- Timeline Markdown renders here -->
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
            const statusBtn = document.getElementById('tab-btn-status');
            const trackCBtn = document.getElementById('tab-btn-track-c');
            const timelineBtn = document.getElementById('tab-btn-timeline');
            
            const mainGlassCard = document.getElementById('main-glass-card');
            const planContent = document.getElementById('content-plan');
            const statusContent = document.getElementById('content-status');
            const trackCContent = document.getElementById('content-track-c');
            const timelineContent = document.getElementById('content-timeline');

            const activeBtnClass = "flex-1 py-2.5 text-center text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 bg-white text-blue-600 shadow-sm border border-slate-200/10";
            const inactiveBtnClass = "flex-1 py-2.5 text-center text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50";

            planBtn.className = inactiveBtnClass;
            statusBtn.className = inactiveBtnClass;
            if (trackCBtn) trackCBtn.className = inactiveBtnClass;
            timelineBtn.className = inactiveBtnClass;

            planContent.classList.add('hidden');
            statusContent.classList.add('hidden');
            if (trackCContent) trackCContent.classList.add('hidden');
            timelineContent.classList.add('hidden');
            mainGlassCard.classList.add('hidden');

            if (tabId === 'plan') {
                planBtn.className = activeBtnClass;
                mainGlassCard.classList.remove('hidden');
                planContent.classList.remove('hidden');
            } else if (tabId === 'status') {
                statusBtn.className = activeBtnClass;
                mainGlassCard.classList.remove('hidden');
                statusContent.classList.remove('hidden');
                renderCharts(); // Render Chart.js charts on show
            } else if (tabId === 'track-c' && trackCContent) {
                trackCBtn.className = activeBtnClass;
                trackCContent.classList.remove('hidden');
                renderCharts(); // Render Chart.js charts on show
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
        }
        document.addEventListener('DOMContentLoaded', async () => {
            const rawMarkdown = document.getElementById('markdown-source').value;
            const parts = rawMarkdown.split('<!-- tab-split -->');
            const planMd = parts[0] || '';
            const statusMd = parts[1] || '';
            const timelineMd = parts[2] || '';
            
            // Render Plan Markdown
            const planHtml = marked.parse(planMd);
            const planContainer = document.getElementById('content-plan');
            planContainer.innerHTML = planHtml;

            // Render Status Markdown
            const statusHtml = marked.parse(statusMd);
            const statusContentDiv = document.getElementById('status-markdown-content');
            statusContentDiv.innerHTML = statusHtml;

            // Render Timeline Markdown
            const timelineHtml = marked.parse(timelineMd);
            const timelineContainer = document.getElementById('content-timeline');
            timelineContainer.innerHTML = timelineHtml;

            // Find and convert Mermaid blocks in all containers
            [planContainer, document.getElementById('content-status'), timelineContainer].forEach(container => {
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
            
            // Handle initial hash routing after markdown and mermaid are fully ready
            const initialHash = window.location.hash.slice(1);
            if (['plan', 'status', 'track-c', 'timeline'].includes(initialHash)) {
                switchTab(initialHash);
            }
        });

        // Listen for history back/forward hash changes
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.slice(1);
            if (['plan', 'status', 'track-c', 'timeline'].includes(hash)) {
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

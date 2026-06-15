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
                更新時間: 2026-06-15 | 設計者: Antigravity
            </div>
        </header>

        <!-- Tab Navigation -->
        <div class="flex space-x-2 p-1.5 bg-slate-200/50 backdrop-blur-md rounded-xl mb-6 max-w-2xl shadow-inner border border-slate-200/30">
            <button id="tab-btn-plan" class="flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 bg-white text-blue-600 shadow-sm border border-slate-200/10" onclick="switchTab('plan')">
                📄 評選工作流規劃
            </button>
            <button id="tab-btn-status" class="flex-1 py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50" onclick="switchTab('status')">
                📌 專案執行現況
            </button>
            ${hasTrackC ? `
            <button id="tab-btn-track-c" class="flex-1 py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50" onclick="switchTab('track-c')">
                📊 軌道 C 社群聲量
            </button>
            ` : ''}
            <button id="tab-btn-timeline" class="flex-1 py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50" onclick="switchTab('timeline')">
                ⏳ 專案進程時間軸
            </button>
        </div>

        <!-- Main Content Card (Standard Markdown layout) -->
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
                <!-- Status Markdown renders here -->
            </div>
            <div id="content-timeline" class="prose max-w-none hidden">
                <!-- Timeline Markdown renders here -->
            </div>
        </div>

        <!-- Track C Content (Rendered outside glass-card using iframe to preserve original styles) -->
        <div id="content-track-c" class="hidden w-full">
            <iframe src="Meta.AI/Podcast聲量評選建議.html" class="w-full h-[85vh] border-0 rounded-2xl shadow-lg bg-[#fdf9f5]"></iframe>
        </div>

        <footer class="text-center text-xs text-slate-500 mt-10">
            此網頁為免伺服器、全自包含靜態檔案。可直接將此 HTML 檔案寄送或分享給團隊成員，雙擊即可在瀏覽器完美閱讀。
        </footer>
    </div>

    <!-- Hidden Raw Markdown Data Source -->
    <textarea id="markdown-source" class="hidden">${mdContent.replace(/<\/textarea>/g, '&lt;/textarea&gt;')}</textarea>

    <script>
        // Configure marked.js
        marked.setOptions({
            breaks: true,
            gfm: true
        });

        // Initialize Mermaid with Light theme
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
            const planBtn = document.getElementById('tab-btn-plan');
            const statusBtn = document.getElementById('tab-btn-status');
            const trackCBtn = document.getElementById('tab-btn-track-c');
            const timelineBtn = document.getElementById('tab-btn-timeline');
            
            const mainGlassCard = document.getElementById('main-glass-card');
            const planContent = document.getElementById('content-plan');
            const statusContent = document.getElementById('content-status');
            const trackCContent = document.getElementById('content-track-c');
            const timelineContent = document.getElementById('content-timeline');

            const activeBtnClass = "flex-1 py-2.5 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 bg-white text-blue-600 shadow-sm border border-slate-200/10";
            const inactiveBtnClass = "flex-1 py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 text-slate-600 hover:text-slate-900 hover:bg-white/50";

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
            } else if (tabId === 'track-c' && trackCContent) {
                trackCBtn.className = activeBtnClass;
                trackCContent.classList.remove('hidden');
            } else {
                timelineBtn.className = activeBtnClass;
                mainGlassCard.classList.remove('hidden');
                timelineContent.classList.remove('hidden');
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
            const statusContainer = document.getElementById('content-status');
            statusContainer.innerHTML = statusHtml;

            // Render Timeline Markdown
            const timelineHtml = marked.parse(timelineMd);
            const timelineContainer = document.getElementById('content-timeline');
            timelineContainer.innerHTML = timelineHtml;

            // Find and convert Mermaid blocks in all containers
            [planContainer, statusContainer, timelineContainer].forEach(container => {
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
            
        });
    </script>
</body>
</html>`;

    const outputPath = path.join(__dirname, 'podcast_evaluation_workflow.html');
    fs.writeFileSync(outputPath, htmlTemplate, 'utf-8');
    console.log(`已成功將規劃書與軌道 C (Meta.AI 聲量評選建議) 整合轉換為白底網頁版：${outputPath}`);
}

generateSelfContainedHtml();

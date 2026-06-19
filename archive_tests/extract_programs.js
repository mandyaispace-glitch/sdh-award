const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const https = require('https');

// Helper for HTTP GET with Retries and Backoff
function fetchJson(url, retries = 3, delay = 2000) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        };
        const req = https.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location, retries, delay).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (data.includes("Rate limit")) {
                    if (retries > 0) {
                        console.warn(`  -> Rate limited on ${url}. Retrying in ${delay/1000}s...`);
                        setTimeout(() => {
                            fetchJson(url, retries - 1, delay * 2).then(resolve).catch(reject);
                        }, delay);
                    } else {
                        reject(new Error("Rate limit"));
                    }
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error("Failed to parse JSON: " + e.message));
                }
            });
        });
        
        req.on('error', (err) => {
            if (retries > 0) {
                console.warn(`  -> Network error (${err.message}) on ${url}. Retrying in ${delay/1000}s...`);
                setTimeout(() => {
                    fetchJson(url, retries - 1, delay * 2).then(resolve).catch(reject);
                }, delay);
            } else {
                reject(err);
            }
        });
    });
}

// Lookup RSS from Apple ID via iTunes API
async function lookupRssByAppleId(appleId) {
    try {
        const url = `https://itunes.apple.com/lookup?id=${appleId}`;
        const data = await fetchJson(url);
        return data.results?.[0]?.feedUrl || null;
    } catch (e) {
        console.error(`Error looking up Apple ID ${appleId}:`, e.message);
        return null;
    }
}

// Search RSS by podcast title or creator name via iTunes API
async function searchRssByTitle(title) {
    try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&entity=podcast&country=tw`;
        const data = await fetchJson(url);
        const result = data.results?.[0];
        if (result) {
            return {
                rssUrl: result.feedUrl || null,
                appleUrl: result.collectionViewUrl || null,
                trackName: result.trackName || "",
                artistName: result.artistName || ""
            };
        }
        return null;
    } catch (e) {
        console.error(`Error searching title ${title}:`, e.message);
        return null;
    }
}

// Helper to normalize strings for comparison (remove spaces, punctuation, lowercase)
function normalizeName(name) {
    if (!name) return "";
    let clean = name.replace(/老師|大叔|心理師|教練|醫師|媽媽/g, '');
    return clean.replace(/[\s\-\_\/\\｜\|\.\,:\：\《\》\(\)\（\）]/g, '').toLowerCase();
}

// Check if search results are a real match to prevent guest-slot mismatches
function isRealPodcastMatch(searchTerm, trackName, artistName) {
    const normSearch = normalizeName(searchTerm);
    const normTrack = normalizeName(trackName);
    const normArtist = normalizeName(artistName);
    
    if (!normSearch || normSearch.length <= 1) return false;
    
    return normTrack.includes(normSearch) || 
           normArtist.includes(normSearch) || 
           normSearch.includes(normTrack);
}

async function main() {
    const pdfPath = 'SDH ERP KOL.pdf';
    if (!fs.existsSync(pdfPath)) {
        console.error("PDF not found");
        return;
    }
    
    console.log("Loading PDF...");
    const dataBuffer = fs.readFileSync(pdfPath);
    const parser = new PDFParse({ data: dataBuffer });
    const doc = await parser.load();
    console.log(`Total Pages: ${doc.numPages}`);
    
    const rawCards = [];
    const colDivider = 297.5; // X center
    
    for (let pageNum = 2; pageNum <= doc.numPages; pageNum++) {
        console.log(`Parsing Page ${pageNum}...`);
        const page = await doc.getPage(pageNum);
        
        const textContent = await page.getTextContent();
        const annotations = await page.getAnnotations();
        const linkAnnots = annotations.filter(ann => ann.subtype === 'Link');
        
        // Group text items into lines (Y within 3 points)
        const lines = [];
        textContent.items.forEach(item => {
            if (!item.str.trim()) return;
            const x = item.transform[4];
            const y = item.transform[5];
            
            let line = lines.find(l => Math.abs(l.y - y) <= 3);
            if (!line) {
                line = { y, items: [] };
                lines.push(line);
            }
            line.items.push({ str: item.str, x, y });
        });
        
        lines.sort((a, b) => b.y - a.y);
        
        const leftHeaders = [];
        const rightHeaders = [];
        
        lines.forEach(line => {
            line.items.sort((a, b) => a.x - b.x);
            
            // Check for Left column header (starts in [70, 80])
            const leftItem = line.items.find(item => item.x >= 70 && item.x <= 80);
            if (leftItem) {
                const headerStr = line.items
                    .filter(item => item.x >= leftItem.x && item.x < colDivider)
                    .map(item => item.str)
                    .join('')
                    .trim();
                
                if (headerStr && headerStr.length > 1 && !leftHeaders.some(h => Math.abs(h.y - line.y) < 10)) {
                    const isNoise = headerStr.startsWith('http') || 
                                    headerStr.includes('%') || 
                                    headerStr.includes('id') || 
                                    headerStr.includes('·') || 
                                    headerStr.includes('粉絲') || 
                                    headerStr.includes('KOL') || 
                                    headerStr.includes('合作資源') || 
                                    headerStr.includes('內部提案') || 
                                    headerStr.includes('資料來源') || 
                                    headerStr === '主檔' || 
                                    headerStr === '親子教養' ||
                                    headerStr.includes('盛德好');
                    if (!isNoise) {
                        leftHeaders.push({ name: headerStr, y: line.y, col: 0 });
                    }
                }
            }
            
            // Check for Right column header (starts in [370, 380])
            const rightItem = line.items.find(item => item.x >= 370 && item.x <= 380);
            if (rightItem) {
                const headerStr = line.items
                    .filter(item => item.x >= rightItem.x)
                    .map(item => item.str)
                    .join('')
                    .trim();
                
                if (headerStr && headerStr.length > 1 && !rightHeaders.some(h => Math.abs(h.y - line.y) < 10)) {
                    const isNoise = headerStr.startsWith('http') || 
                                    headerStr.includes('%') || 
                                    headerStr.includes('id') || 
                                    headerStr.includes('·') || 
                                    headerStr.includes('粉絲') || 
                                    headerStr.includes('KOL') || 
                                    headerStr.includes('合作資源') || 
                                    headerStr.includes('內部提案') || 
                                    headerStr.includes('資料來源') || 
                                    headerStr === '主檔' || 
                                    headerStr === '親子教養' ||
                                    headerStr.includes('盛德好');
                    if (!isNoise) {
                        rightHeaders.push({ name: headerStr, y: line.y, col: 1 });
                    }
                }
            }
        });
        
        leftHeaders.sort((a, b) => b.y - a.y);
        rightHeaders.sort((a, b) => b.y - a.y);
        
        const getRanges = (headers) => {
            return headers.map((h, idx) => {
                const top = h.y + 15;
                const bottom = (idx + 1 < headers.length) ? (headers[idx + 1].y + 15) : 0;
                return { header: h, top, bottom };
            });
        };
        
        const leftRanges = getRanges(leftHeaders);
        const rightRanges = getRanges(rightHeaders);
        
        const pageCards = [];
        leftRanges.forEach(r => pageCards.push({ header: r.header, top: r.top, bottom: r.bottom, col: 0, textItems: [], links: [] }));
        rightRanges.forEach(r => pageCards.push({ header: r.header, top: r.top, bottom: r.bottom, col: 1, textItems: [], links: [] }));
        
        // Place text items
        textContent.items.forEach(item => {
            if (!item.str.trim()) return;
            const x = item.transform[4];
            const y = item.transform[5];
            const col = x < colDivider ? 0 : 1;
            
            const card = pageCards.find(c => c.col === col && y >= c.bottom && y <= c.top);
            if (card) {
                card.textItems.push({ str: item.str, x, y });
            }
        });
        
        // Place link annotations
        linkAnnots.forEach(ann => {
            const rect = ann.rect;
            const x = (rect[0] + rect[2]) / 2;
            const y = (rect[1] + rect[3]) / 2;
            const col = x < colDivider ? 0 : 1;
            
            const card = pageCards.find(c => c.col === col && y >= c.bottom && y <= c.top);
            if (card) {
                card.links.push(ann.url || ann.unsafeUrl);
            }
        });
        
        // Extract names
        pageCards.forEach(card => {
            card.textItems.sort((a, b) => {
                if (Math.abs(a.y - b.y) > 3) return b.y - a.y;
                return a.x - b.x;
            });
            
            const lines = [];
            let currentLine = [];
            let currentY = -1;
            card.textItems.forEach(item => {
                if (currentY === -1 || Math.abs(item.y - currentY) > 3) {
                    if (currentLine.length > 0) {
                        lines.push(currentLine.map(x => x.str).join('').trim());
                    }
                    currentLine = [item];
                    currentY = item.y;
                } else {
                    currentLine.push(item);
                }
            });
            if (currentLine.length > 0) {
                lines.push(currentLine.map(x => x.str).join('').trim());
            }
            
            const partnerName = card.header.name;
            
            // Exclude MandyAI (the user/organizer assistant)
            if (partnerName.includes('MandyAI') || partnerName.includes('AI共享幕僚')) {
                console.log(`[Excluded Organizer] ${partnerName} skipped.`);
                return;
            }
            
            let podcastName = partnerName;
            if (lines.length > 1) {
                // Find second line, ignoring partnerName, category list, follower list, and single-character initials or dashes
                const secondLine = lines.find(l => {
                    return l !== partnerName && 
                           l.length > 2 && // Skip single-character initials and short noise like dashes
                           !l.includes('·') && 
                           !l.includes('粉絲') && 
                           !l.startsWith('粉絲') &&
                           l !== '—';
                });
                if (secondLine) {
                    podcastName = secondLine;
                }
            }
            
            const appleUrl = card.links.find(url => url.includes('podcasts.apple.com')) || null;
            
            rawCards.push({
                partnerName,
                podcastName,
                appleUrl
            });
        });
    }
    
    console.log(`\nSuccessfully parsed ${rawCards.length} clean KOL cards from PDF.`);
    
    // Load CSV
    const csvPath = 'updated_sheet.csv';
    const csvRssMap = new Map();
    const csvAppleMap = new Map();
    const csvPodcastNameMap = new Map();
    
    if (fs.existsSync(csvPath)) {
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.split(/\r?\n/);
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            
            const cells = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(x => x.replace(/^"|"$/g, '').trim());
            const partner = cells[2] || '';
            const apple = cells[10] || '';
            const rss = cells[11] || '';
            const podcastName = cells[9] || '';
            
            if (partner) {
                const normalizedPartner = normalizeName(partner);
                if (rss && rss.startsWith('http')) csvRssMap.set(normalizedPartner, rss);
                if (apple && apple.startsWith('http')) csvAppleMap.set(normalizedPartner, apple);
                if (podcastName) csvPodcastNameMap.set(normalizedPartner, podcastName);
            }
        }
    }
    
    const resolvedPrograms = [];
    
    for (let i = 0; i < rawCards.length; i++) {
        const card = rawCards[i];
        const normalizedP = normalizeName(card.partnerName);
        
        let rssUrl = null;
        let appleUrl = card.appleUrl;
        let podcastName = card.podcastName;
        
        // 1. Try CSV match first
        if (csvRssMap.has(normalizedP)) {
            rssUrl = csvRssMap.get(normalizedP);
            podcastName = csvPodcastNameMap.get(normalizedP) || podcastName;
            if (csvAppleMap.has(normalizedP)) {
                appleUrl = csvAppleMap.get(normalizedP);
            }
            console.log(`[CSV Match] ${card.partnerName} -> ${podcastName} (RSS: ${rssUrl})`);
        } 
        // 2. If no CSV match, but we have an Apple URL from PDF annotations, query iTunes API
        else if (appleUrl) {
            const idMatch = appleUrl.match(/\/id(\d+)/);
            if (idMatch) {
                const appleId = idMatch[1];
                console.log(`[Apple Link Lookup] ${card.partnerName} (ID: ${appleId})...`);
                rssUrl = await lookupRssByAppleId(appleId);
                await new Promise(r => setTimeout(r, 200));
            }
        }
        // 3. If no Apple link and no CSV match, search iTunes API by Title or Partner Name
        else {
            // Guardrail: Skip searching if term is too short or invalid
            const term = normalizeName(podcastName);
            if (term && term.length > 1) {
                console.log(`[Searching API] ${card.partnerName} (${podcastName})...`);
                
                // Search by Podcast Name first
                let searchResult = await searchRssByTitle(podcastName);
                
                // Verify if it is a real match (not guest slot)
                if (searchResult && isRealPodcastMatch(podcastName, searchResult.trackName, searchResult.artistName)) {
                    rssUrl = searchResult.rssUrl;
                    appleUrl = searchResult.appleUrl;
                    podcastName = searchResult.trackName;
                    console.log(`  -> Resolved via title search: "${podcastName}" -> ${rssUrl}`);
                } else {
                    // Try searching by Partner Name
                    searchResult = await searchRssByTitle(card.partnerName);
                    if (searchResult && isRealPodcastMatch(card.partnerName, searchResult.trackName, searchResult.artistName)) {
                        rssUrl = searchResult.rssUrl;
                        appleUrl = searchResult.appleUrl;
                        podcastName = searchResult.trackName;
                        console.log(`  -> Resolved via partner search: "${podcastName}" -> ${rssUrl}`);
                    } else {
                        console.log(`  -> Rejected/No match for "${card.partnerName}". Classified as non-podcast.`);
                    }
                }
                await new Promise(r => setTimeout(r, 200));
            } else {
                console.log(`[Skipped Search] ${card.partnerName} has invalid search term "${podcastName}". Classified as non-podcast.`);
            }
        }
        
        resolvedPrograms.push({
            partnerName: card.partnerName,
            podcastName: podcastName,
            applePodcastUrl: appleUrl || "",
            rssUrl: rssUrl || ""
        });
    }
    
    // --- Deduplication and Merging ---
    const uniquePrograms = [];
    
    resolvedPrograms.forEach(p => {
        // Non-podcast KOLs
        if (!p.rssUrl) {
            const existingNonPod = uniquePrograms.find(item => !item.rssUrl && normalizeName(item.partnerName) === normalizeName(p.partnerName));
            if (!existingNonPod) {
                uniquePrograms.push(p);
            }
            return;
        }
        
        // Podcast programs
        const existing = uniquePrograms.find(item => item.rssUrl === p.rssUrl);
        if (existing) {
            if (!existing.partnerName.includes(p.partnerName)) {
                existing.partnerName = `${existing.partnerName} / ${p.partnerName}`;
            }
            console.log(`[Merged Duplicate] Combined partner for duplicate RSS: ${existing.partnerName} -> ${existing.podcastName}`);
        } else {
            uniquePrograms.push(p);
        }
    });
    
    // Save to kol_programs_list.json
    fs.writeFileSync('kol_programs_list.json', JSON.stringify(uniquePrograms, null, 2), 'utf-8');
    console.log(`\n🎉 Completed! Saved ${uniquePrograms.length} unique entries to kol_programs_list.json.`);
    
    const missing = uniquePrograms.filter(p => !p.rssUrl);
    console.log(`Total Podcast Programs: ${uniquePrograms.length - missing.length}`);
    console.log(`Total Non-Podcast KOLs: ${missing.length}`);
}

main().catch(err => {
    console.error("Error:", err);
});

const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');
const https = require('https');

// Helper for HTTP GET
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        };
        https.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error("Failed to parse JSON: " + e.message));
                }
            });
        }).on('error', reject);
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

// Search RSS by podcast title via iTunes API
async function searchRssByTitle(title) {
    try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&entity=podcast&country=tw`;
        const data = await fetchJson(url);
        // Find best match
        const result = data.results?.[0];
        if (result) {
            return {
                rssUrl: result.feedUrl || null,
                appleUrl: result.collectionViewUrl || null
            };
        }
        return null;
    } catch (e) {
        console.error(`Error searching title ${title}:`, e.message);
        return null;
    }
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
    
    const cards = [];
    
    // Grid layout constants
    const colDivider = 297.5; // X center
    const rowHeight = 95.5;   // Y distance between rows
    const topY = 795.0;       // Y top of the grid
    
    for (let pageNum = 2; pageNum <= doc.numPages; pageNum++) {
        console.log(`Parsing Page ${pageNum}...`);
        const page = await doc.getPage(pageNum);
        
        // 1. Get text content
        const textContent = await page.getTextContent();
        
        // 2. Get annotations (links)
        const annotations = await page.getAnnotations();
        const linkAnnots = annotations.filter(ann => ann.subtype === 'Link');
        
        // We will create a grid representation for this page.
        // For pages 2-6, there are 8 rows and 2 columns.
        // For page 7, we will adjust based on what we find or default to the same.
        const numRows = 8;
        const numCols = 2;
        
        // Create 2D array of card cells
        const grid = Array.from({ length: numRows }, () => 
            Array.from({ length: numCols }, () => ({
                textItems: [],
                links: []
            }))
        );
        
        // Place text items into grid cells
        textContent.items.forEach(item => {
            if (!item.str.trim()) return;
            const x = item.transform[4];
            const y = item.transform[5];
            
            // Determine column
            const col = x < colDivider ? 0 : 1;
            
            // Determine row based on Y coordinate
            // We want to map Y to a row index from 0 to 7
            // row 0: y is near 786.9
            // row 7: y is near 118.4
            // Formula: row = round((topY - y) / rowHeight)
            let row = Math.round((topY - y) / rowHeight);
            if (row < 0) row = 0;
            if (row >= numRows) row = numRows - 1;
            
            grid[row][col].textItems.push({ str: item.str, x, y });
        });
        
        // Place link annotations into grid cells
        linkAnnots.forEach(ann => {
            const rect = ann.rect; // [x1, y1, x2, y2]
            const x = (rect[0] + rect[2]) / 2;
            const y = (rect[1] + rect[3]) / 2;
            
            const col = x < colDivider ? 0 : 1;
            let row = Math.round((topY - y) / rowHeight);
            if (row < 0) row = 0;
            if (row >= numRows) row = numRows - 1;
            
            grid[row][col].links.push(ann.url || ann.unsafeUrl);
        });
        
        // Extract card info from each grid cell
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
                const cell = grid[r][c];
                if (cell.textItems.length === 0) continue; // Empty cell
                
                // Sort text items: y descending (top to bottom), then x ascending (left to right)
                cell.textItems.sort((a, b) => {
                    if (Math.abs(a.y - b.y) > 3) {
                        return b.y - a.y; // Higher y first
                    }
                    return a.x - b.x; // Left x first
                });
                
                // Reconstruct lines of text by grouping items with similar Y coordinate
                const lines = [];
                let currentLine = [];
                let currentY = -1;
                
                cell.textItems.forEach(item => {
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
                
                if (lines.length === 0) continue;
                
                // Heuristics to get partnerName and podcastName
                const partnerName = lines[0];
                let podcastName = partnerName;
                
                if (lines.length > 1) {
                    const secondLine = lines[1];
                    // Check if the second line is a category or follower line
                    const isMetadata = secondLine.includes('·') || 
                                       secondLine.includes('粉絲') || 
                                       secondLine.startsWith('粉絲');
                    if (!isMetadata) {
                        podcastName = secondLine;
                    }
                }
                
                // Find Apple Podcast Link in links
                const appleUrl = cell.links.find(url => url.includes('podcasts.apple.com')) || null;
                const otherUrls = cell.links.filter(url => !url.includes('podcasts.apple.com'));
                
                cards.push({
                    page: pageNum,
                    row: r,
                    col: c,
                    partnerName,
                    podcastName,
                    appleUrl,
                    otherUrls,
                    allLinks: cell.links
                });
            }
        }
    }
    
    console.log(`\nSuccessfully grouped ${cards.length} program cards.`);
    
    // Now we will resolve the RSS feed URLs for each program.
    // To prevent hitting APIs too hard and to be safe, we will first check if we already have a matched RSS feed from updated_sheet.csv.
    // Let's load updated_sheet.csv and create a map.
    const csvPath = 'updated_sheet.csv';
    const csvRssMap = new Map();
    const csvAppleMap = new Map();
    
    if (fs.existsSync(csvPath)) {
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const lines = csvContent.split(/\r?\n/);
        for (let i = 2; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;
            
            // Simple split
            const cells = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(x => x.replace(/^"|"$/g, '').trim());
            const partner = cells[2] || '';
            const apple = cells[10] || '';
            const rss = cells[11] || '';
            if (partner) {
                if (rss && rss.startsWith('http')) csvRssMap.set(partner, rss);
                if (apple && apple.startsWith('http')) csvAppleMap.set(partner, apple);
            }
        }
    }
    
    console.log(`Loaded ${csvRssMap.size} existing programs from updated_sheet.csv.`);
    
    // Resolve RSS URLs
    const finalPrograms = [];
    
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        console.log(`[${i+1}/${cards.length}] Resolving: ${card.partnerName} (${card.podcastName})`);
        
        let rssUrl = null;
        let appleUrl = card.appleUrl;
        
        // 1. Try mapping from CSV by partnerName
        if (csvRssMap.has(card.partnerName)) {
            rssUrl = csvRssMap.get(card.partnerName);
            if (!appleUrl && csvAppleMap.has(card.partnerName)) {
                appleUrl = csvAppleMap.get(card.partnerName);
            }
            console.log(`  -> Found in CSV: ${rssUrl}`);
        }
        
        // 2. Try looking up Apple ID if we have Apple URL
        if (!rssUrl && appleUrl) {
            const idMatch = appleUrl.match(/\/id(\d+)/);
            if (idMatch) {
                const appleId = idMatch[1];
                console.log(`  -> Found Apple ID: ${appleId}. Querying iTunes API...`);
                rssUrl = await lookupRssByAppleId(appleId);
                if (rssUrl) {
                    console.log(`    -> iTunes API returned RSS: ${rssUrl}`);
                }
                // Sleep slightly to respect rate limits
                await new Promise(r => setTimeout(r, 100));
            }
        }
        
        // 3. Try searching by Title if still no RSS
        if (!rssUrl) {
            console.log(`  -> Searching by title: "${card.podcastName}"...`);
            const searchResult = await searchRssByTitle(card.podcastName);
            if (searchResult) {
                rssUrl = searchResult.rssUrl;
                if (!appleUrl) appleUrl = searchResult.appleUrl;
                console.log(`    -> Found via Search: ${rssUrl}`);
            } else {
                console.log(`    -> No search result found.`);
            }
            // Sleep slightly
            await new Promise(r => setTimeout(r, 100));
        }
        
        finalPrograms.push({
            partnerName: card.partnerName,
            podcastName: card.podcastName,
            applePodcastUrl: appleUrl || "",
            rssUrl: rssUrl || ""
        });
    }
    
    // Save to kol_programs_list.json
    fs.writeFileSync('kol_programs_list.json', JSON.stringify(finalPrograms, null, 2), 'utf-8');
    console.log(`\n🎉 Extracted all programs! Saved ${finalPrograms.length} entries to kol_programs_list.json.`);
    
    // Let's print out the ones that failed to resolve RSS
    const missingRss = finalPrograms.filter(p => !p.rssUrl);
    console.log(`Total missing RSS URLs: ${missingRss.length}`);
    if (missingRss.length > 0) {
        console.log("Missing RSS programs:");
        missingRss.forEach(p => console.log(`- ${p.partnerName}: ${p.podcastName}`));
    }
}

main().catch(err => {
    console.error("Error running main:", err);
});

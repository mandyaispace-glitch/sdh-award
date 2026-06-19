const fs = require('fs');
const https = require('https');

// Helper to normalize strings for comparison (remove spaces, punctuation, lowercase)
function normalizeName(name) {
    if (!name) return "";
    return name.replace(/[\s\-\_\/\\｜\|\.\,]/g, '').toLowerCase();
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        };
        https.get(url, options, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (data.includes("Rate limit")) {
                    reject(new Error("Rate limit"));
                    return;
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error("Failed to parse JSON: " + e.message));
                }
            });
        }).on('error', reject);
    });
}

async function lookupRssByAppleId(appleId) {
    const url = `https://itunes.apple.com/lookup?id=${appleId}`;
    const data = await fetchJson(url);
    return data.results?.[0]?.feedUrl || null;
}

async function searchRssByTitle(title) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&entity=podcast&country=tw`;
    const data = await fetchJson(url);
    const result = data.results?.[0];
    if (result) {
        return {
            rssUrl: result.feedUrl || null,
            appleUrl: result.collectionViewUrl || null,
            trackName: result.trackName || null
        };
    }
    return null;
}

async function main() {
    const listPath = 'kol_programs_list.json';
    const csvPath = 'updated_sheet.csv';
    
    if (!fs.existsSync(listPath)) {
        console.error("kol_programs_list.json not found");
        return;
    }
    
    const programs = JSON.parse(fs.readFileSync(listPath, 'utf-8'));
    console.log(`Loaded ${programs.length} programs from JSON.`);
    
    // Load CSV
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
    
    console.log(`Loaded ${csvRssMap.size} normalized entries from CSV.`);
    
    // First, try to resolve missing ones using the CSV normalized mapping
    let resolvedCount = 0;
    programs.forEach(p => {
        const normalizedP = normalizeName(p.partnerName);
        
        // If RSS is missing, try matching CSV normalized name
        if (!p.rssUrl && csvRssMap.has(normalizedP)) {
            p.rssUrl = csvRssMap.get(normalizedP);
            p.podcastName = csvPodcastNameMap.get(normalizedP) || p.podcastName;
            if (!p.applePodcastUrl && csvAppleMap.has(normalizedP)) {
                p.applePodcastUrl = csvAppleMap.get(normalizedP);
            }
            resolvedCount++;
            console.log(`[CSV Normalized Match] Resolved ${p.partnerName} -> ${p.rssUrl}`);
        }
    });
    
    console.log(`Resolved ${resolvedCount} programs using normalized CSV lookup.`);
    
    // Now, query iTunes API for the remaining ones that still lack RSS
    const missing = programs.filter(p => !p.rssUrl);
    console.log(`Remaining missing RSS: ${missing.length}`);
    
    for (let i = 0; i < missing.length; i++) {
        const p = missing[i];
        
        // Clean up title if it's footer/header noise from PDF
        if (p.partnerName.includes('盛德好') || p.partnerName.includes('資料來源')) {
            // Remove this entry since it's just PDF footer text
            programs.splice(programs.indexOf(p), 1);
            console.log(`Removed PDF footer/header noise entry: ${p.partnerName}`);
            continue;
        }
        
        console.log(`[API Query ${i+1}/${missing.length}] Resolving: ${p.partnerName} (${p.podcastName})`);
        
        // Try query with exponential backoff on rate limits
        let success = false;
        let attempts = 0;
        let delay = 2000; // start with 2s delay
        
        while (!success && attempts < 3) {
            try {
                // If we have an Apple URL, use it
                if (p.applePodcastUrl) {
                    const idMatch = p.applePodcastUrl.match(/\/id(\d+)/);
                    if (idMatch) {
                        const appleId = idMatch[1];
                        console.log(`  -> Querying Apple ID ${appleId}...`);
                        const rss = await lookupRssByAppleId(appleId);
                        if (rss) {
                            p.rssUrl = rss;
                            success = true;
                            console.log(`    -> Resolved RSS: ${rss}`);
                        }
                    }
                }
                
                // If still not resolved, search by title
                if (!success) {
                    console.log(`  -> Searching by title: "${p.podcastName}"...`);
                    const searchResult = await searchRssByTitle(p.podcastName);
                    if (searchResult) {
                        p.rssUrl = searchResult.rssUrl;
                        if (!p.applePodcastUrl) p.applePodcastUrl = searchResult.appleUrl;
                        if (searchResult.trackName) p.podcastName = searchResult.trackName;
                        success = true;
                        console.log(`    -> Resolved RSS via title: ${p.rssUrl}`);
                    } else {
                        // Try searching by partnerName as fallback
                        console.log(`  -> Searching by partner: "${p.partnerName}"...`);
                        const searchResult2 = await searchRssByTitle(p.partnerName);
                        if (searchResult2) {
                            p.rssUrl = searchResult2.rssUrl;
                            if (!p.applePodcastUrl) p.applePodcastUrl = searchResult2.appleUrl;
                            if (searchResult2.trackName) p.podcastName = searchResult2.trackName;
                            success = true;
                            console.log(`    -> Resolved RSS via partner: ${p.rssUrl}`);
                        } else {
                            console.log(`    -> No results for both title and partner.`);
                            success = true; // mark done even if not found to avoid loop
                        }
                    }
                }
                
                // Sleep to respect rate limits
                await new Promise(r => setTimeout(r, 1500));
                
            } catch (err) {
                attempts++;
                if (err.message === "Rate limit" || err.message.includes("Rate limit")) {
                    console.warn(`  -> Rate limit hit. Waiting ${delay/1000}s and retrying (attempt ${attempts}/3)...`);
                    await new Promise(r => setTimeout(r, delay));
                    delay *= 2; // double delay
                } else {
                    console.error(`  -> Error resolving: ${err.message}`);
                    break;
                }
            }
        }
    }
    
    // Save updated list
    fs.writeFileSync(listPath, JSON.stringify(programs, null, 2), 'utf-8');
    console.log(`\n🎉 Script finished! Total programs in list: ${programs.length}.`);
    
    const finalMissing = programs.filter(p => !p.rssUrl);
    console.log(`Final missing RSS: ${finalMissing.length}`);
    if (finalMissing.length > 0) {
        finalMissing.forEach(p => console.log(`- ${p.partnerName}: ${p.podcastName}`));
    }
}

main().catch(err => {
    console.error("Error:", err);
});

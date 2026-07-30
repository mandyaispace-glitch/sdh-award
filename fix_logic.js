const fs = require('fs');

// 1. Fix host_metadata.json
let meta = JSON.parse(fs.readFileSync('host_metadata.json', 'utf8'));
if (meta['楊月娥（楊肉爐）']) meta['楊月娥（楊肉爐）'].is_duo_or_multiple_hosts = true;
if (meta['無所不試無樂不作']) meta['無所不試無樂不作'].is_duo_or_multiple_hosts = true;
fs.writeFileSync('host_metadata.json', JSON.stringify(meta, null, 2), 'utf8');
console.log('Fixed host_metadata.json');

// 2. Patch calculate_top10.js
let code = fs.readFileSync('calculate_top10.js', 'utf8');

// The code has this loop for padding:
// while (awardRankings.length < 10) { ... push null 不適用 ... }
// We can just remove that loop by replacing it.
let replaced = code.replace(/while \(awardRankings\.length < 10\) \{[\s\S]*?\}/g, '');
if (replaced !== code) {
    console.log('Removed while(awardRankings.length < 10) loop');
    code = replaced;
}

// Or just safely filter it right before fs.writeFileSync
const target = "fs.writeFileSync(outputPath, JSON.stringify({ awards: finalAwardsResults }, null, 2), 'utf-8');";
const replacement = `
    Object.keys(finalAwardsResults).forEach(k => {
        finalAwardsResults[k].ranking = finalAwardsResults[k].ranking.filter(r => r.compliance === "符合" && r.score !== null);
        finalAwardsResults[k].ranking.forEach((r, idx) => r.rank = idx + 1);
    });
    fs.writeFileSync(outputPath, JSON.stringify({ awards: finalAwardsResults }, null, 2), 'utf-8');
`;
if (code.includes(target)) {
    code = code.replace(target, replacement);
    console.log('Patched final output generation');
}

fs.writeFileSync('calculate_top10.js', code, 'utf8');
console.log('Done patching.');

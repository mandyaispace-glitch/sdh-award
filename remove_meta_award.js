const fs = require('fs');
const jsonPath = 'awards_top10_results.json';
if (fs.existsSync(jsonPath)) {
    let data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (data.awards && data.awards['欸我跟你獎']) {
        delete data.awards['欸我跟你獎'];
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
        console.log('Removed 欸我跟你獎 from JSON');
    } else {
        console.log('欸我跟你獎 not found in JSON');
    }
}

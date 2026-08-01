const fs = require('fs');

let code = fs.readFileSync('batch_track_b.js', 'utf8');

const dlStart = code.indexOf('function downloadFile(url, destPath) {');
const dlEnd = code.indexOf('// 3. Helper for HTTP POST requests with timeout');

if (dlStart > -1 && dlEnd > dlStart) {
    const newDl = `function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const { exec } = require('child_process');
        const cmd = \`curl.exe -L -s --fail -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -o "\${destPath}" "\${url}"\`;
        exec(cmd, { timeout: 300000 }, (error, stdout, stderr) => {
            if (error) {
                return reject(new Error(\`curl 下載失敗: \${error.message}\`));
            }
            resolve();
        });
    });
}

`;
    code = code.substring(0, dlStart) + newDl + code.substring(dlEnd);
}

fs.writeFileSync('batch_track_b.js', code, 'utf8');
console.log("downloadFile patched with curl + User-Agent!");

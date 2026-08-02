const fs = require('fs');
let js = fs.readFileSync('generate_html.js', 'utf8');

// Replace the exact unescaped variable with an escaped one
if (js.includes('${specialCommentaryHtml}')) {
    js = js.replace(/\$\{specialCommentaryHtml\}/g, '\\${specialCommentaryHtml}');
    fs.writeFileSync('generate_html.js', js);
    console.log("Fixed escaping.");
} else {
    console.log("Target not found.");
}

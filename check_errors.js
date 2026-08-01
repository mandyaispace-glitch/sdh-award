const {JSDOM, VirtualConsole} = require('jsdom');
const fs = require('fs');
let html = fs.readFileSync('podcast_evaluation_workflow.html', 'utf8');
const virtualConsole = new VirtualConsole();
virtualConsole.sendTo(console, { omitJSDOMErrors: false });
const dom = new JSDOM(html, { runScripts: 'dangerously', virtualConsole });
dom.window.addEventListener('error', e => console.log('GLOBAL ERROR:', e.error || e.message));
dom.window.addEventListener('unhandledrejection', e => console.log('PROMISE REJECTION:', e.reason));
setTimeout(() => {
    console.log('Track A length:', dom.window.document.getElementById('poc-awards-container-track-a').innerHTML.length);
    process.exit(0);
}, 2000);

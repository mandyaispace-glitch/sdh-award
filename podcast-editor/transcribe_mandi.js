import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const OUTPUT_DIR = 'C:\\Users\\manma\\OneDrive\\Documents\\Antigrivity\\SDH Award\\poc_transcripts';
const TEMP_DIR = path.resolve('temp_transcribe_mandi');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function downloadFile(url, dest) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  if (!res.ok) throw new Error(`HTTP 錯誤: ${res.status}`);
  const fileStream = fs.createWriteStream(dest);
  await finished(Readable.fromWeb(res.body).pipe(fileStream));
}

async function getAudioDuration(filePath) {
  const cmd = `ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`;
  const { stdout } = await execAsync(cmd);
  const dur = parseFloat(stdout.trim());
  if (isNaN(dur)) {
    throw new Error('無法取得音訊長度');
  }
  return dur;
}

async function transcribeToGroq(filePath, originalName, retries = 5) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('找不到 GROQ_API_KEY 環境變數，請確認 .env 檔案設定。');
  }

  const formData = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  const fileBlob = new Blob([fileBuffer], { type: 'audio/mp3' });
  
  formData.append('file', fileBlob, originalName);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'verbose_json');
  formData.append('language', 'zh');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (response.status === 429) {
    if (retries > 0) {
      const errData = await response.json().catch(() => ({}));
      const errMsg = errData?.error?.message || '';
      const retryAfterStr = errMsg.match(/try again in (.*?s)/)?.[1] || '90s';
      console.warn(`\n⚠️  [Rate Limit] 觸發 API 頻率限制 (429)。系統指示在 ${retryAfterStr} 後重試。`);
      
      let waitMs = 0;
      const secondsMatch = retryAfterStr.match(/(\d+(\.\d+)?)\s*s/);
      const minutesMatch = retryAfterStr.match(/(\d+)\s*m/);
      
      if (secondsMatch) {
        waitMs += parseFloat(secondsMatch[1]) * 1000;
      }
      if (minutesMatch) {
        waitMs += parseInt(minutesMatch[1]) * 60 * 1000;
      }
      
      if (waitMs === 0) {
        waitMs = 90000;
      } else {
        waitMs += 5000;
      }
      
      console.warn(`👉 正在自動等待 ${(waitMs / 1000).toFixed(1)} 秒後重試... (剩餘重試次數: ${retries})`);
      await sleep(waitMs);
      return await transcribeToGroq(filePath, originalName, retries - 1);
    }
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API 錯誤 (${response.status}): ${errText}`);
  }

  return await response.json();
}

async function processEpisode(item) {
  const targetPath = path.join(OUTPUT_DIR, item.filename);

  console.log(`\n========================================`);
  console.log(`開始處理單集: ${item.name} - ${item.title}`);
  console.log(`標準存檔名稱: ${item.filename}`);
  console.log(`下載連結: ${item.url}`);

  if (fs.existsSync(targetPath)) {
    const stats = fs.statSync(targetPath);
    if (stats.size > 1024) {
      console.log(`✅ 該集已存在且大於 1KB，略過。`);
      return;
    }
  }

  const tempMp3 = path.join(TEMP_DIR, `temp_${Date.now()}.mp3`);
  let compressedMp3 = '';
  let chunkDir = '';

  try {
    console.log('1. 下載音檔中...');
    await downloadFile(item.url, tempMp3);
    console.log('   下載完成。');

    const duration = await getAudioDuration(tempMp3);
    console.log(`   音訊總長度: ${duration.toFixed(2)} 秒 (${formatTime(duration)})`);

    let finalTranscriptText = '';

    console.log('3. 重新編碼為單聲道 96k MP3...');
    compressedMp3 = path.join(TEMP_DIR, `compressed_${Date.now()}.mp3`);
    await execAsync(`ffmpeg -y -i "${tempMp3}" -c:a libmp3lame -b:a 96k -ac 1 "${compressedMp3}"`);

    console.log('4. 將音訊切片為每 10 分鐘一段...');
    chunkDir = path.join(TEMP_DIR, `chunks_${Date.now()}`);
    fs.mkdirSync(chunkDir, { recursive: true });
    const chunkPattern = path.join(chunkDir, `chunk_%03d.mp3`);
    await execAsync(`ffmpeg -y -i "${compressedMp3}" -f segment -segment_time 600 -c copy "${chunkPattern}"`);

    const chunkFiles = fs.readdirSync(chunkDir)
      .filter(f => f.startsWith('chunk_'))
      .sort();

    console.log(`   切片完成，共 ${chunkFiles.length} 個片段。開始送往雲端辨識...`);

    let cumulativeDuration = 0;
    for (let i = 0; i < chunkFiles.length; i++) {
      const chunkFile = chunkFiles[i];
      const chunkPath = path.join(chunkDir, chunkFile);
      console.log(`   正在辨識片段 [${i + 1}/${chunkFiles.length}]: ${chunkFile}，偏移量: ${formatTime(cumulativeDuration)}...`);

      const result = await transcribeToGroq(chunkPath, `${item.filename.replace('.txt', '')}_chunk_${i}.mp3`);
      
      if (result.segments) {
        result.segments.forEach(s => {
          finalTranscriptText += `[${formatTime(s.start + cumulativeDuration)}] ${s.text}\n`;
        });
      }
      
      cumulativeDuration += parseFloat(result.duration || 600);

      if (i < chunkFiles.length - 1) {
        console.log('   片段辨識完成。額外延遲 15 秒防 Rate Limit...');
        await sleep(15000);
      }
    }

    console.log(`5. 儲存逐字稿至指定資料夾...`);
    fs.writeFileSync(targetPath, finalTranscriptText, 'utf-8');
    console.log(`   儲存成功！檔案位置: ${targetPath}`);
    console.log(`🎉 單集轉寫順利完成：${item.title}`);

  } catch (error) {
    console.error(`❌ 處理失敗:`, error);
    throw error;
  } finally {
    [tempMp3, compressedMp3].forEach(f => {
      if (f && fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch (e) {}
      }
    });
    if (chunkDir && fs.existsSync(chunkDir)) {
      try {
        fs.rmSync(chunkDir, { recursive: true, force: true });
      } catch (e) {}
    }
  }
}

async function run() {
  const items = [
    {
      name: '曼蒂歐逆-轉型之路',
      title: '跟長輩一樣就能學會AI？陶韻智老師的反慣性AI學《 AI First 自我升級革命》',
      url: 'https://m.cdn.firstory.me/track/clocpi7xz05b501wbh0mp54fy/cmnzyi0nt012101wy8lztfqv6/https%3A%2F%2Ffile.cdn.firstory.me%2FRecord%2Fclocpi7xz05b501wbh0mp54fy%2Fcmnzyi0nt012201wyaj99d0nc.mp3?v=1781320932545',
      filename: '曼蒂歐逆-轉型之路_跟長輩一樣就能學會AI？陶韻智老師的反慣性AI學《 AI First 自我升級革命》_transcript.txt'
    },
    {
      name: '曼蒂歐逆-轉型之路',
      title: '再不用證明自己給誰看 feat 精算媽咪珊迪兔 《值得過上好日子》',
      url: 'https://m.cdn.firstory.me/track/clocpi7xz05b501wbh0mp54fy/cmqzy0bww003i01u00m337x14/https%3A%2F%2Ffile.cdn.firstory.me%2FRecord%2Fclocpi7xz05b501wbh0mp54fy%2Fcmqzy0bww003j01u0hd93eqba.mp3?v=1782781458079',
      filename: '曼蒂歐逆-轉型之路_再不用證明自己給誰看 feat 精算媽咪珊迪兔 《值得過上好日子》_transcript.txt'
    },
    {
      name: '曼蒂歐逆-轉型之路',
      title: '好像很爽，我們也去當個旅遊作家好嗎？',
      url: 'https://m.cdn.firstory.me/track/clocpi7xz05b501wbh0mp54fy/cmlqohil10jnu01u50zoa1ptq/https%3A%2F%2Ffile.cdn.firstory.me%2FRecord%2Fclocpi7xz05b501wbh0mp54fy%2Fcmlqohil10jnv01u5dd1i7eny.mp3?v=1781321369964',
      filename: '曼蒂歐逆-轉型之路_好像很爽，我們也去當個旅遊作家好嗎？_transcript.txt'
    }
  ];

  for (const item of items) {
    try {
      await processEpisode(item);
      // Wait between episodes to prevent 429
      console.log('等待 20 秒以防止 Rate Limit...');
      await sleep(20000);
    } catch (e) {
      console.error(`處理單集時出錯: ${item.title}`, e);
      process.exit(1);
    }
  }

  console.log('🎉 所有三集轉寫順利完成！');
}

run();

import os
import xml.etree.ElementTree as ET
import urllib.request
from datetime import datetime, timedelta
import email.utils
import random
import json

def parse_rss_and_select_episodes(rss_url, min_duration_minutes=10, max_duration_minutes=50, months_limit=6):
    """
    解析 Podcast RSS feed，過濾符合時間與長度的集數，並隨機抽取 2 集。
    """
    try:
        # 下載並解析 RSS XML
        headers = {'User-Agent': 'Mozilla/5.0'}
        req = urllib.request.Request(rss_url, headers=headers)
        with urllib.request.urlopen(req) as response:
            xml_data = response.read()
        
        root = ET.fromstring(xml_data)
        channel = root.find('channel')
        if channel is None:
            return {"error": "Invalid RSS format (no channel tag)"}
        
        podcast_title = channel.findtext('title', 'Unknown Podcast').strip()
        episodes = []
        
        # 時間過濾基準（過去 X 個月）
        date_limit = datetime.now() - timedelta(days=months_limit * 30)
        
        # 遍歷所有單集 (<item>)
        for item in channel.findall('item'):
            title = item.findtext('title', '').strip()
            enclosure = item.find('enclosure')
            mp3_url = enclosure.get('url') if enclosure is not None else None
            pub_date_str = item.findtext('pubDate', '')
            
            # 解析發布時間
            pub_date = None
            if pub_date_str:
                try:
                    pub_tuple = email.utils.parsedate_tz(pub_date_str)
                    if pub_tuple:
                        pub_date = datetime.fromtimestamp(email.utils.mktime_tz(pub_tuple))
                except Exception:
                    pass
            
            # 解析單集長度 (itunes:duration)
            duration_minutes = None
            duration_str = None
            for child in item:
                if 'duration' in child.tag:
                    duration_str = child.text
                    break
            
            if duration_str:
                try:
                    # 格式可能是: "HH:MM:SS", "MM:SS", 或是秒數
                    parts = duration_str.split(':')
                    if len(parts) == 3: # HH:MM:SS
                        duration_minutes = int(parts[0]) * 60 + int(parts[1]) + int(parts[2]) / 60
                    elif len(parts) == 2: # MM:SS
                        duration_minutes = int(parts[0]) + int(parts[1]) / 60
                    else: # 秒數
                        duration_minutes = int(parts[0]) / 60
                except ValueError:
                    pass

            # 過濾條件：
            # 1. 必須有音檔連結
            # 2. 時間在過去 6 個月內
            # 3. 長度在限制範圍內 (若抓不到長度則先寬鬆保留)
            if mp3_url and pub_date and pub_date >= date_limit:
                if duration_minutes is None or (min_duration_minutes <= duration_minutes <= max_duration_minutes):
                    episodes.append({
                        "title": title,
                        "pub_date": pub_date.strftime("%Y-%m-%d %H:%M:%S"),
                        "duration_minutes": round(duration_minutes, 2) if duration_minutes else None,
                        "mp3_url": mp3_url
                    })
        
        # 隨機抽取 2 集
        if len(episodes) >= 2:
            sampled = random.sample(episodes, 2)
        else:
            sampled = episodes # 若不足 2 集則全部保留
            
        return {
            "podcast_title": podcast_title,
            "total_available_episodes": len(episodes),
            "sampled_episodes": sampled
        }
        
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    # 測試用範例 RSS 連結 (這裡可替換為實際 Firstory RSS 網址)
    test_rss_feeds = [
        "https://open.firstory.me/rss/user/cl21t933k042u01w86y98ex7o" # 範例 RSS
    ]
    
    results = {}
    for idx, url in enumerate(test_rss_feeds):
        print(f"正在處理第 {idx+1} 個節目...")
        res = parse_rss_and_select_episodes(url)
        results[url] = res
        
    # 將結果輸出成 JSON，方便後續對照音檔或進行下載
    output_path = "sampled_results.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=4)
        
    print(f"\n抽樣完成！結果已儲存至 {output_path}")
    print(json.dumps(results, ensure_ascii=False, indent=2))

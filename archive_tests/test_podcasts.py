import os
import xml.etree.ElementTree as ET
import urllib.request
import json
import re
from datetime import datetime, timedelta
import email.utils

def search_apple_podcast(name):
    """
    使用 Apple Search API 搜尋 Podcast，取得 Apple ID 和 RSS URL
    """
    url = f"https://itunes.apple.com/search?term={urllib.parse.quote(name)}&country=tw&media=podcast&limit=1"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
        if data.get('resultCount', 0) > 0:
            result = data['results'][0]
            return {
                "podcast_name": result.get("collectionName"),
                "apple_id": result.get("collectionId"),
                "rss_url": result.get("feedUrl"),
                "track_count": result.get("trackCount")
            }
    except Exception as e:
        print(f"搜尋 Apple Podcast 失敗: {e}")
    return None

def check_eligibility_and_list_episodes(rss_url, months_limit=6):
    """
    讀取 RSS Feed，計算過去 6 個月內的總集數與清單
    """
    try:
        req = urllib.request.Request(rss_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            xml_data = response.read()
        
        root = ET.fromstring(xml_data)
        channel = root.find('channel')
        if channel is None:
            return None, "無法找到 RSS channel 標籤"
            
        podcast_title = channel.findtext('title', 'Unknown').strip()
        episodes_in_range = []
        
        # 2026-06-14 往回推 6 個月
        current_time = datetime(2026, 6, 14)
        date_limit = current_time - timedelta(days=months_limit * 30)
        
        for item in channel.findall('item'):
            title = item.findtext('title', '').strip()
            pub_date_str = item.findtext('pubDate', '')
            enclosure = item.find('enclosure')
            mp3_url = enclosure.get('url') if enclosure is not None else None
            
            pub_date = None
            if pub_date_str:
                try:
                    pub_tuple = email.utils.parsedate_tz(pub_date_str)
                    if pub_tuple:
                        pub_date = datetime.fromtimestamp(email.utils.mktime_tz(pub_tuple))
                except Exception:
                    pass
            
            if pub_date and pub_date >= date_limit:
                episodes_in_range.append({
                    "title": title,
                    "pub_date": pub_date.strftime("%Y-%m-%d"),
                    "mp3_url": mp3_url
                })
        
        eligible = len(episodes_in_range) >= 12
        return {
            "title": podcast_title,
            "episodes_count_past_6_months": len(episodes_in_range),
            "eligible": eligible,
            "episodes": episodes_in_range
        }, None
    except Exception as e:
        return None, str(e)

def get_apple_reviews(apple_id):
    """
    透過 Apple Customer Reviews RSS 取得留言數與評分
    """
    url = f"https://itunes.apple.com/tw/rss/customerreviews/id={apple_id}/json"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
        
        feed = data.get('feed', {})
        entries = feed.get('entry', [])
        
        # 如果只有一筆，iTunes 會直接回傳 object 而不是 list，需要包裝一下
        if isinstance(entries, dict):
            entries = [entries]
            
        reviews = []
        # entry 的第一筆通常是節目的基本資訊，而不是留言，所以要過濾
        for entry in entries:
            if 'author' in entry and 'im:rating' in entry:
                author = entry['author']['name']['label']
                rating = int(entry['im:rating']['label'])
                title = entry['title']['label']
                content = entry['content']['label']
                reviews.append({
                    "author": author,
                    "rating": rating,
                    "title": title,
                    "content": content
                })
        return {
            "total_reviews_found": len(reviews),
            "sample_reviews": reviews[:3] # 取前三筆展示
        }
    except Exception as e:
        return {"error": f"取得 Apple 留言失敗: {e}"}

def get_spotify_ratings(spotify_url):
    """
    嘗試爬取 Spotify 頁面中的評分和星等
    """
    try:
        req = urllib.request.Request(spotify_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'})
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
        
        # 在 HTML 中搜尋類似 "4.8 (1,234)" 或 schema.org JSON-LD 中的 rating 資訊
        # Spotify 常在 script type="application/ld+json" 中放置 ratingValue 與 ratingCount
        json_ld_matches = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
        for match in json_ld_matches:
            try:
                ld = json.loads(match.strip())
                # 有時候是 @type: Series 或 PodcastSeries
                if "aggregateRating" in ld:
                    rating = ld["aggregateRating"]
                    return {
                        "rating_value": rating.get("ratingValue"),
                        "rating_count": rating.get("ratingCount")
                    }
            except Exception:
                pass
        
        # 備用：正則表達式匹配
        # 例如："4.9 (1.2k)" 或 "4.9 (1,234)"
        # 尋找包含 rating 的 meta 或 text
        rating_match = re.search(r'ratingValue[":\s]+([0-9.]+)', html)
        count_match = re.search(r'ratingCount[":\s]+([0-9,]+)', html)
        if rating_match and count_match:
            return {
                "rating_value": float(rating_match.group(1)),
                "rating_count": int(count_match.group(1).replace(',', ''))
            }
            
        # 嘗試在普通文本中尋找
        # 例如 Spotify 上常見格式: 5.0 (13)
        span_match = re.search(r'([0-5]\.[0-9])\s+\(([0-9,kK\s]+)\)', html)
        if span_match:
            return {
                "rating_value": float(span_match.group(1)),
                "rating_count_raw": span_match.group(2).strip()
            }
            
    except Exception as e:
        return {"error": f"抓取 Spotify 失敗: {e}"}
    return {"status": "未在 HTML 中找到 rating 欄位，可能被 React 遮蔽"}

if __name__ == "__main__":
    print("=================== 測試 1: 任性歐逆機智生活 ===================")
    # 搜尋 Apple ID
    oni_apple = search_apple_podcast("任性歐逆機智生活")
    print("Apple 搜尋結果:", json.dumps(oni_apple, ensure_ascii=False, indent=2))
    
    if oni_apple:
        print("\n進行資格審查與集數抽樣...")
        info, err = check_eligibility_and_list_episodes(oni_apple['rss_url'])
        if info:
            print(f"節目名稱: {info['title']}")
            print(f"過去 6 個月集數: {info['episodes_count_past_6_months']}")
            print(f"符合評選資格 (>=12集): {'【是】' if info['eligible'] else '【否】'}")
            if info['episodes']:
                print("最新三集範例:")
                for ep in info['episodes'][:3]:
                    print(f" - [{ep['pub_date']}] {ep['title']}")
        else:
            print("審查錯誤:", err)
            
        print("\n取得 Apple 聽眾留言...")
        reviews = get_apple_reviews(oni_apple['apple_id'])
        print(json.dumps(reviews, ensure_ascii=False, indent=2))
        
    print("\n抓取 Spotify 評分人數...")
    oni_spotify = get_spotify_ratings("https://open.spotify.com/show/3RSITJFvOU7hy3VcDKYUBU")
    print("Spotify 評分結果:", json.dumps(oni_spotify, ensure_ascii=False, indent=2))
    
    print("\n=================== 測試 2: 科技領航家 朱楚文 ===================")
    chu_apple_id = "1485503209"
    # 也可以用搜尋
    chu_apple = search_apple_podcast("科技領航家")
    print("Apple 搜尋結果:", json.dumps(chu_apple, ensure_ascii=False, indent=2))
    
    if chu_apple:
        print("\n進行資格審查與集數抽樣...")
        info, err = check_eligibility_and_list_episodes(chu_apple['rss_url'])
        if info:
            print(f"節目名稱: {info['title']}")
            print(f"過去 6 個月集數: {info['episodes_count_past_6_months']}")
            print(f"符合評選資格 (>=12集): {'【是】' if info['eligible'] else '【否】'}")
            if info['episodes']:
                print("最新三集範例:")
                for ep in info['episodes'][:3]:
                    print(f" - [{ep['pub_date']}] {ep['title']}")
        else:
            print("審查錯誤:", err)
            
        print("\n取得 Apple 聽眾留言...")
        reviews = get_apple_reviews(chu_apple_id)
        print(json.dumps(reviews, ensure_ascii=False, indent=2))
        
    print("\n抓取 Spotify 評分人數...")
    chu_spotify = get_spotify_ratings("https://open.spotify.com/show/7o50v1V5w4oNFRfH6Fnx4f")
    print("Spotify 評分結果:", json.dumps(chu_spotify, ensure_ascii=False, indent=2))

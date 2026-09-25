import requests
import json
import re
from collections import Counter
import sys
from fpdf import FPDF
import os

# Google Fonts Noto Sans Symbols + Regular
FONT_URL_SYMBOLS = "https://github.com/googlefonts/noto-fonts/raw/main/unhinted/ttf/NotoSansSymbols2/NotoSansSymbols2-Regular.ttf"
FONT_FILE_SYMBOLS = "NotoSansSymbols2-Regular.ttf"

FONT_URL_REGULAR = "https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf"
FONT_FILE_REGULAR = "NotoSans-Regular.ttf"

# YOUR API KEY HERE
API_KEY = "YOUR API KEY HERE"

with open("youtube_video_ids.json", "r", encoding="utf-8") as f:
    video_ids = json.load(f)

def main():
    name  = input("Name: ").strip().title()

    print(f"\n\n\nYouTube Video Analysis (YVA):\n\nHello, {name}.\nIn this program you obtain data about one YouTube video of your choice.\nThe program will provide information based on your Youtube history.")

    # Input URL
    print(f"What YouTube video do you want to analyze?\n")
    video_id = parse_id(input(f"YouTube URL: "))
    if not video_id:
        sys.exit("Input is not a valid YouTube video, try again")
    try:
        title, description, uploader, thumbnail_link, publication_date = convert(video_id)
    except (UnboundLocalError, ValueError):
        print("Input is not a valid YouTube video, try again")
        sys.exit(0)

    metadata1 = f"\"{title}\"\n uploaded by \"{uploader}\""
    metadata2 = f"\n\"{title}\" uploaded by \"{uploader}\"\n"

    # Check how many times the video has been watched in the database
    count_id = history(video_id)
    if count_id == 1:
        amount_watched = (f"\n{count_id} time\n")
    else:
        amount_watched = (f"\n{count_id} times\n")

    # Produce thumbnail
    thumbnails(thumbnail_link)

    # Number 1 most watched
    most_list = []
    most_views=[]
    top_n = 1
    for i in range(top_n):
        if i == 0:
            _, Count = most_watched(i)
        video_id_most, count = most_watched(i)
        vid_name, _, uploader,_,_ = convert(video_id_most)
        most_list.append(f"Most viewed title: \"{vid_name}\" uploaded by \"{uploader}\"")
    most_views.append(f"Most viewed views: {count} times\n")

    # Join into a single string for PDF
    most_text = "\n".join(most_list)
    most_views = "\n".join(most_views)

    # Percentile calculation
    perc_text = percentile(video_id)

    # Create PDF to show data
    PDF(name,metadata1, amount_watched, most_text, most_views, metadata2, description, perc_text, publication_date)
    print(f"\nOpen Project.pdf to see rapport")


# Parses id sequence
def parse_id(URL):
    patterns = [
        r"v=([a-zA-Z0-9_-]{11})",
        r"youtu\.be/([a-zA-Z0-9_-]{11})"
    ]
    for pattern in patterns:
        match = re.search(pattern, URL)
        if match:
            return match[1]
    return None

def convert(id):
    # Converts user link to data
    url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id={id}&key={API_KEY}"
    url = requests.get(url)
    if url.status_code != 200:
        raise ValueError("YouTube API request failed")
    data = url.json()
    if not data.get("items"):
        raise ValueError("Invalid video ID")

    snippet = data["items"][0]["snippet"]
    title = snippet.get("title", "Unknown Title")
    description = snippet.get("description", "No description available")
    uploader = snippet.get("channelTitle", "Unknown Uploader")
    publication_date = snippet.get("publishedAt", "N/A").split("T")[0]

    # Thumbnail link
    thumbnails  = snippet.get("thumbnails", {})
    thumbnail_link = next(
        (thumbnails[q]["url"] for q in ["maxres", "standard", "high", "medium", "default"] if q in thumbnails),
        None
    )
    publication_date = f"\n{publication_date}\n"
    description = f"\n{description}\n"

    return title, description, uploader, thumbnail_link, publication_date

# Produces thumbnail picture for PDF
def thumbnails(thumbnail_link):
    if not thumbnail_link:
        return
    response = requests.get(thumbnail_link)
    if response.status_code == 200:
        with open('thumbnail.jpg', 'wb') as file:
            file.write(response.content)

# Check with the database e.g my history
def history(link):
    count = video_ids.count(link)
    return count

# Check which is the most watched video in my history
def most_watched(rank):
    vid_id_counter = Counter(video_ids)
    most_common_list = vid_id_counter.most_common(rank + 1)  # rank starts at 0
    video_id, count = most_common_list[rank]
    return video_id, count

def ensure_font():
    """Download Noto Sans fonts if not present."""
    fonts = [
        (FONT_FILE_SYMBOLS, FONT_URL_SYMBOLS),
        (FONT_FILE_REGULAR, FONT_URL_REGULAR)
    ]
    for file, url in fonts:
        if not os.path.exists(file):
            print(f"Downloading {file} for Unicode support...")
            r = requests.get(url)
            r.raise_for_status()
            with open(file, "wb") as f:
                f.write(r.content)
            print(f"{file} downloaded.")

# Calculates the percentile based on views compared to watch history
def percentile(video_id):
    vid_id_counter = Counter(video_ids)

    # count for this video
    target_count = vid_id_counter.get(video_id, 0)
    if target_count == 0:
        return 0.0   # if the video never appears in your history

    # list of counts for unique videos
    counts = sorted(vid_id_counter.values())
    total = len(counts)

    # how many videos have fewer views
    below = sum(c < target_count for c in counts)
    # how many videos have exactly the same number of views
    equal = sum(c == target_count for c in counts)

    # percentile rank (with tie adjustment)
    percentile_rank = (below + 0.5 * equal) / total * 100
    return round(percentile_rank, 2)


def PDF(name, metadata1, amount_watched, most, most_views, metadata2, description, perc_text, publication_date):
    ensure_font()
    pdf = FPDF()
    pdf.add_page()

    # Register Unicode fonts (no 'uni=True')
    pdf.add_font("NotoSans", "", FONT_FILE_REGULAR)
    pdf.add_font("NotoSansSymbols", "", FONT_FILE_SYMBOLS)

    # Set default font
    pdf.set_font("NotoSans", size=15)

    # Thumbnail
    if os.path.exists("thumbnail.jpg"):
        pdf.image("thumbnail.jpg", 25, 15, 160)

    pdf.ln(130)
    pdf.multi_cell(0, 10, f"YouTube Video Analysis for: ", align="C")
    pdf.ln(15)
    pdf.set_font_size(25)
    pdf.multi_cell(0, 10, metadata1, align="C")
    pdf.ln(30)
    pdf.set_font_size(15)
    pdf.multi_cell(0, 10, f"Name: {name}", align="C")

    # Results page
    pdf.add_page()
    pdf.ln(5)
    pdf.set_font_size(20)
    pdf.multi_cell(0,10, f"Results", align="C")
    pdf.set_font_size(15)
    pdf.ln(10)
    pdf.multi_cell(0, 10, f"Video:{metadata2}", align="L")
    pdf.multi_cell(0, 10, f"Publication date:{publication_date}", align="L")
    pdf.multi_cell(0, 10, f"Viewed:{amount_watched}", align="L")
    pdf.multi_cell(0, 10, f"Video description:{description}", align="L")

    # History comparison
    pdf.add_page()
    pdf.set_font_size(20)
    pdf.multi_cell(0, 10, f"Comparison to history", align="C")
    pdf.set_font_size(15)
    pdf.ln(10)
    pdf.cell(0,10,f"Percentile: {perc_text:.2f}%", align="L")
    pdf.ln(10)
    pdf.cell(0, 10, most, align="L")
    pdf.ln(10)
    pdf.cell(0,10,most_views, align="L")

    pdf.output("Project.pdf")


if __name__ == "__main__":
    main()

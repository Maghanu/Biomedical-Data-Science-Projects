import re
import json

# Path to your large HTML Takeout file
html_file = "history.html"

# Regex pattern to match YouTube video URLs and capture only the video ID
youtube_id_pattern = re.compile(r"watch\?v=([\w-]{11})")
video_ids = []

# Read file line by line
with open(html_file, "r", encoding="utf-8") as f:
    for line in f:
        matches = youtube_id_pattern.findall(line)
        if matches:
            video_ids.extend(matches)

# Save to JSON
with open("youtube_video_ids.json", "w", encoding="utf-8") as f:
    json.dump(video_ids, f, indent=4, ensure_ascii=False)

print(f"Extracted {len(video_ids)} unique video ids")

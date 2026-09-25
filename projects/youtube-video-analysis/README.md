# YouTube Video Analysis

## Project overview

A Python project that analyses a personal YouTube watch history and generates a
PDF report for a selected video. The report combines YouTube metadata with
history-based measures such as viewing frequency, percentile rank, and the
most-watched video.

## Project files

| File | Purpose |
| --- | --- |
| `jsonify.py` | Extracts 11-character YouTube video IDs from `history.html` |
| `project.py` | Queries the YouTube Data API and creates the PDF report |
| `test_project.py` | Tests the parsing and analysis functions |
| `requirements.txt` | Lists the Python dependencies |

## Workflow

1. Export YouTube history with [Google Takeout](https://takeout.google.com/).
2. Place the exported `watch-history.html` in this project directory and rename
	it to `history.html`.
3. Run `jsonify.py` to create `youtube_video_ids.json`.
4. Add a YouTube Data API key through a local environment variable or local
	configuration. Never commit the key.
5. Run `project.py` and enter the video URL when prompted.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python jsonify.py
python project.py
pytest
```

## Output

The generated PDF includes the selected video's title, uploader, publication
date, description, thumbnail, number of views in the personal history,
percentile rank, and comparison with the most-watched video.

## Privacy

`history.html`, `youtube_video_ids.json`, `cookies.txt`, API keys, thumbnails,
fonts, and generated PDFs are local files and must not be committed. The
repository `.gitignore` excludes these files. Use anonymised or synthetic data
for a public demonstration.

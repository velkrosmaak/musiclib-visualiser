#!/usr/bin/env python3
"""mv.py — Music library visualiser

Scans a directory tree for audio files, extracts ID3 (and other) metadata using mutagen,
collects genre statistics and performs basic statistical analysis, then writes JSON
outputs which can be visualised by the included D3 web UI.

Usage:
  python3 mv.py /path/to/music --output web/data --workers 8 --serve

Dependencies:
  pip install -r requirements.txt
"""

import argparse
import concurrent.futures
import json
import math
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime
import statistics
from tqdm import tqdm

from mutagen import File as MutagenFile

AUDIO_EXTENSIONS = {'.mp3', '.flac', '.m4a', '.mp4', '.aac', '.ogg', '.wav', '.wma'}


def find_audio_files(root, extensions=None):
    extensions = extensions or AUDIO_EXTENSIONS
    for dirpath, dirnames, filenames in os.walk(root):
        for fn in filenames:
            if os.path.splitext(fn)[1].lower() in extensions:
                yield os.path.join(dirpath, fn)


def extract_metadata(path):
    """Extract metadata from an audio file using mutagen.

    Returns None if the file is not a recognized audio file or can't be read.
    """
    try:
        mf = MutagenFile(path, easy=True)
        mfull = MutagenFile(path)
        if mf is None:
            return None

        tags = {k: v for k, v in mf.items()}

        title = ';'.join(tags.get('title', [])) if 'title' in tags else None
        artist = ';'.join(tags.get('artist', [])) if 'artist' in tags else None
        album = ';'.join(tags.get('album', [])) if 'album' in tags else None
        genre = ';'.join(tags.get('genre', [])) if 'genre' in tags else None
        date = ';'.join(tags.get('date', [])) if 'date' in tags else None

        info = mfull.info if mfull is not None else None

        duration = getattr(info, 'length', None)
        bitrate = getattr(info, 'bitrate', None)

        return {
            'path': path,
            'title': title,
            'artist': artist,
            'album': album,
            'genre': genre,
            'date': date,
            'duration': float(duration) if duration is not None else None,
            'bitrate': int(bitrate) if bitrate is not None else None,
        }
    except Exception as e:
        # Avoid noisy exceptions per-file — caller will count failures
        return {'path': path, 'error': str(e)}


def normalize_genres(genre_str):
    if not genre_str:
        return ['Unknown']
    # split on common separators
    sep_chars = [';', '/', ',', '|']
    parts = [genre_str]
    for s in sep_chars:
        new_parts = []
        for p in parts:
            new_parts.extend([x.strip() for x in p.split(s) if x.strip()])
        parts = new_parts
    if not parts:
        return ['Unknown']
    # normalize casing
    return [p.title() for p in parts]


def analyze(metadata_list):
    stats = {}
    total = len(metadata_list)
    scanned = 0

    genre_counter = Counter()
    artist_counter = Counter()
    album_counter = Counter()
    year_counter = Counter()

    durations = []
    per_genre_durations = defaultdict(list)
    per_genre_artist = defaultdict(Counter)
    cooccurrence = Counter()

    # duration bins (seconds)
    DURATION_BINS = [0, 120, 240, 360, 720, 36000]
    DURATION_BIN_LABELS = ['<2m', '2-4m', '4-6m', '6-12m', '12m+']
    duration_bin_counts = Counter()
    per_genre_duration_bins = defaultdict(Counter)

    errors = []

    def duration_bin_label(seconds):
        for i in range(len(DURATION_BINS)-1):
            if DURATION_BINS[i] <= seconds < DURATION_BINS[i+1]:
                return DURATION_BIN_LABELS[i]
        return DURATION_BIN_LABELS[-1]

    for m in metadata_list:
        if m is None:
            continue
        if 'error' in m:
            errors.append(m)
            continue

        scanned += 1
        # Genres may be multiple
        genres = normalize_genres(m.get('genre'))
        for g in genres:
            genre_counter[g] += 1

        # artist/album
        artist_name = m.get('artist')
        if artist_name:
            artist_counter[artist_name] += 1
            for g in genres:
                per_genre_artist[g][artist_name] += 1
        if m.get('album'):
            album_counter[m['album']] += 1

        # years: try extract 4-digit year from date if present
        date = m.get('date')
        if date:
            # grab first 4-digit year
            import re
            match = re.search(r"(19|20)\d{2}", date)
            if match:
                year_counter[match.group(0)] += 1

        # duration
        if m.get('duration'):
            dur = m['duration']
            durations.append(dur)
            bin_label = duration_bin_label(dur)
            duration_bin_counts[bin_label] += 1
            for g in genres:
                per_genre_durations[g].append(dur)
                per_genre_duration_bins[g][bin_label] += 1

        # genre co-occurrence
        if len(genres) > 1:
            gs = sorted(set(genres))
            for i in range(len(gs)):
                for j in range(i + 1, len(gs)):
                    cooccurrence[(gs[i], gs[j])] += 1

    # compute stats
    def numeric_stats(arr):
        if not arr:
            return None
        return {
            'count': len(arr),
            'sum': sum(arr),
            'mean': statistics.mean(arr),
            'median': statistics.median(arr),
            'min': min(arr),
            'max': max(arr),
            'stdev': statistics.stdev(arr) if len(arr) > 1 else 0.0,
        }

    per_genre_stats = {g: numeric_stats(v) for g, v in per_genre_durations.items()}

    stats['summary'] = {
        'total_files_found': total,
        'files_scanned': scanned,
        'files_with_errors': len(errors),
        'unique_genres': len(genre_counter),
        'unique_artists': len(artist_counter),
        'unique_albums': len(album_counter),
    }

    stats['top_genres'] = genre_counter.most_common(30)
    stats['least_common_genres'] = genre_counter.most_common()[:-31:-1]
    stats['genre_counts'] = dict(genre_counter)
    stats['artist_counts'] = dict(artist_counter.most_common(200))
    stats['album_counts'] = dict(album_counter.most_common(200))
    stats['year_counts'] = dict(year_counter)
    stats['durations'] = numeric_stats(durations)
    stats['per_genre_duration_stats'] = per_genre_stats

    # top artists per genre
    stats['top_artists_per_genre'] = { g: per_genre_artist[g].most_common(20) for g in per_genre_artist }

    # duration bins
    stats['duration_bins'] = dict(duration_bin_counts)
    stats['per_genre_duration_bins'] = { g: dict(per_genre_duration_bins[g]) for g in per_genre_duration_bins }

    # cooccurrence as list
    stats['genre_cooccurrence'] = [ { 'pair': list(k), 'count': v } for k, v in cooccurrence.items() ]
    stats['errors'] = errors[:50]

    return stats


def run_scan(root, workers=8, exts=None):
    files = list(find_audio_files(root, exts))
    total_files = len(files)
    print(f"Found {total_files} audio files under {root}")
    metadata_list = []

    start_time = datetime.now()

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        future_to_path = {ex.submit(extract_metadata, p): p for p in files}
        pbar = tqdm(total=total_files, unit='file', desc='Scanning', ncols=100)
        processed = 0
        errors = 0

        for fut in concurrent.futures.as_completed(future_to_path):
            p = future_to_path[fut]
            try:
                res = fut.result()
                if res is not None and 'error' in res:
                    errors += 1
                metadata_list.append(res)
            except Exception as e:
                errors += 1
                metadata_list.append({'path': p, 'error': str(e)})

            processed += 1
            elapsed = (datetime.now() - start_time).total_seconds()
            rate = processed / elapsed if elapsed > 0 else 0.0
            remaining = total_files - processed
            eta = remaining / rate if rate > 0 else None
            pbar.set_postfix({'processed': processed, 'errors': errors, 'rate/s': f"{rate:.2f}", 'eta_s': f"{int(eta)}" if eta else 'N/A'})
            pbar.update(1)

        pbar.close()

    return metadata_list


def save_json(obj, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(obj, fh, indent=2, ensure_ascii=False)


def main():
    parser = argparse.ArgumentParser(description='Scan music library and produce genre statistics + web visualisation assets')
    parser.add_argument('root', nargs='?', default='.', help='Root path to scan')
    parser.add_argument('--workers', '-w', type=int, default=max(4, (os.cpu_count() or 2) * 2), help='Number of worker threads')

    args = parser.parse_args()

    start = datetime.now()
    md = run_scan(args.root, workers=args.workers)

    stats = analyze(md)

    # Hardcode output dir and always serve
    output_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'web', 'data'))
    save_json({'files': md}, os.path.join(output_dir, 'files.json'))
    save_json({'stats': stats}, os.path.join(output_dir, 'stats.json'))

    print(f"Scan and analysis complete in {datetime.now() - start}")
    print(f"Wrote stats to {os.path.join(output_dir, 'stats.json')}")

    # Always start the simple HTTP server to preview the D3 visualisation
    web_root = os.path.abspath(os.path.join(os.path.dirname(__file__), 'web'))
    print(f"Starting HTTP server at http://localhost:8000 serving {web_root} (press Ctrl-C to stop)")
    os.chdir(web_root)
    try:
        from http.server import SimpleHTTPRequestHandler, HTTPServer
        server = HTTPServer(('localhost', 8000), SimpleHTTPRequestHandler)
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped')


if __name__ == '__main__':
    main()

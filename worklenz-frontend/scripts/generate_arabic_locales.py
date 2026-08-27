import os
import sys
import json
import re
import time
import urllib.request
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

SOURCE_DIR = 'public/locales/en'
TARGET_DIR = 'public/locales/ar'
CACHE_FILE = 'scripts/ar_translation_cache.json'

CUSTOM_GLOSSARY = {
    "Worklenz": "Worklenz",
    "Gantt": "غانت",
    "Kanban": "كانبان",
    "English": "الإنجليزية",
    "Spanish": "الإسبانية",
    "Portuguese": "البرتغالية",
    "German": "الألمانية",
    "Albanian": "الألبانية",
    "Chinese": "الصينية",
    "Arabic": "العربية",
}

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_cache(cache):
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

def protect_string(text):
    if not text or not isinstance(text, str) or not text.strip():
        return text, []
    
    placeholders = []
    
    def repl(m):
        placeholders.append(m.group(0))
        return f' _PLCHLDR_{len(placeholders)-1}_ '

    pat = r'(\{\{[^}]+\}\}|\{[^}]+\}|<[^>]+>|%[sdif])'
    modified = re.sub(pat, repl, text)
    return modified, placeholders

def unprotect_string(text, placeholders):
    if not placeholders or not text:
        return text
    result = text
    for i, orig in enumerate(placeholders):
        pat = re.compile(r'\s*_\s*PLCHLDR\s*_\s*' + str(i) + r'\s*_\s*', re.IGNORECASE)
        result = pat.sub(orig, result)
    return result

def translate_single(text):
    if not text or not isinstance(text, str) or not text.strip():
        return text
    if re.fullmatch(r'[\d\s\-_.,:;!@#$%^&*()+=/\\|<>?`~]+', text):
        return text
    
    protected, placeholders = protect_string(text)
    url = 'https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=ar&dt=t&q=' + urllib.parse.quote(protected)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        translated = ''.join([part[0] for part in res[0] if part and part[0]])
        return unprotect_string(translated, placeholders)

def translate_batch(items):
    if not items:
        return []
    
    protected_items = []
    all_placeholders = []
    for item in items:
        p, phs = protect_string(item)
        p = p.replace('\n', ' ')
        protected_items.append(p)
        all_placeholders.append(phs)

    numbered = '\n'.join([f'{i+1}. {text}' for i, text in enumerate(protected_items)])
    url = 'https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=en&tl=ar&dt=t&q=' + urllib.parse.quote(numbered)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
    
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            full = ''.join([part[0] for part in data[0] if part and part[0]])

        parts = re.split(r'(?:^|\n)\s*\d+[\.\،\-]\s*', full)
        parts = [p.strip() for p in parts if p.strip()]

        if len(parts) == len(items):
            results = []
            for part, phs in zip(parts, all_placeholders):
                results.append(unprotect_string(part, phs))
            return results
    except Exception as e:
        pass
    
    # Fallback to single translations
    results = []
    for item in items:
        try:
            results.append(translate_single(item))
            time.sleep(0.02)
        except Exception:
            results.append(item)
    return results

def collect_all_strings(data, string_set):
    if isinstance(data, dict):
        for v in data.values():
            collect_all_strings(v, string_set)
    elif isinstance(data, list):
        for item in data:
            collect_all_strings(item, string_set)
    elif isinstance(data, str):
        if data.strip() and not re.fullmatch(r'[\d\s\-_.,:;!@#$%^&*()+=/\\|<>?`~]+', data):
            string_set.add(data)

def translate_data(data, cache):
    if isinstance(data, dict):
        new_dict = {}
        for k, v in data.items():
            new_dict[k] = translate_data(v, cache)
        return new_dict
    elif isinstance(data, list):
        return [translate_data(item, cache) for item in data]
    elif isinstance(data, str):
        return cache.get(data, data)
    else:
        return data

def process_file(rel_path, cache):
    src_path = os.path.join(SOURCE_DIR, rel_path)
    dst_path = os.path.join(TARGET_DIR, rel_path)
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    
    with open(src_path, 'r', encoding='utf-8') as fp:
        src_data = json.load(fp)
    
    dst_data = translate_data(src_data, cache)
    
    # Custom post-processing for account-setup.json languages dict
    if rel_path == 'account-setup.json' and 'languages' in dst_data:
        dst_data['languages'] = {
            "en": "English",
            "es": "Español",
            "pt": "Português",
            "de": "Deutsch",
            "alb": "Shqip",
            "zh": "简体中文",
            "ar": "العربية"
        }
    
    with open(dst_path, 'w', encoding='utf-8') as fp:
        json.dump(dst_data, fp, ensure_ascii=False, indent=2)

def main():
    os.makedirs(TARGET_DIR, exist_ok=True)
    cache = load_cache()
    cache.update(CUSTOM_GLOSSARY)

    files = []
    for root, _, filenames in os.walk(SOURCE_DIR):
        for f in filenames:
            if f.endswith('.json'):
                files.append(os.path.relpath(os.path.join(root, f), SOURCE_DIR))
    
    files.sort()

    unique_strings = set()
    for rel_path in files:
        with open(os.path.join(SOURCE_DIR, rel_path), 'r', encoding='utf-8') as fp:
            data = json.load(fp)
            collect_all_strings(data, unique_strings)

    untranslated = [s for s in unique_strings if s not in cache]
    print(f"Total: {len(unique_strings)}, Remaining: {len(untranslated)}, Cached: {len(unique_strings) - len(untranslated)}", flush=True)

    batch_size = 25
    batches = [untranslated[i:i+batch_size] for i in range(0, len(untranslated), batch_size)]

    def process_batch(b):
        res = translate_batch(b)
        time.sleep(0.05)
        return b, res

    completed = 0
    with ThreadPoolExecutor(max_workers=5) as executor:
        for b, res in executor.map(process_batch, batches):
            for orig, trans in zip(b, res):
                cache[orig] = trans
            completed += len(b)
            if completed % 100 == 0 or completed >= len(untranslated):
                save_cache(cache)
                print(f"Progress: {completed}/{len(untranslated)} ({completed * 100 // len(untranslated)}%)", flush=True)

    save_cache(cache)
    print("Writing all Arabic locale files...", flush=True)
    for rel_path in files:
        process_file(rel_path, cache)

    print(f"All {len(files)} Arabic JSON locale files successfully created in {TARGET_DIR}!", flush=True)

if __name__ == '__main__':
    main()

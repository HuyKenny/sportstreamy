#!/usr/bin/env python3
"""Fail if a secret VALUE is in the tracked files of the given repos or in rendered output. The repos are PUBLIC.

In CI the values come from the environment (GitHub secrets); locally from ~/ai/credentials. Only the file and the
secret's NAME are ever printed.
    python3 scripts/static/verify_no_secrets.py --repo <repo dir>... | --dir <rendered files dir>...
"""
import os
import subprocess
import sys
from pathlib import Path

NAMES = ['TIPSPORT_CLIENT_ID', 'TIPSPORT_CLIENT_SECRET', 'CHANCE_API_USER', 'CHANCE_API_PASS', 'APISPORTS_KEY',
         'CLOUDFLARE_API_TOKEN', 'STATE_KEY', 'RESULTS_ADMIN_TOKEN', 'CF_GLOBAL_API_KEY', 'CF_API_KEY', 'WP_APP_PASSWORD', 'FTP_PASSWORD',
         'CF_API_TOKEN_SPORTSTREAMY']
# Short values that are not secret on their own (user names) are skipped by the length limit.
MIN_LEN = 10


def values():
    vals = {n: os.environ[n] for n in NAMES if len(os.environ.get(n, '')) >= MIN_LEN}
    if not os.environ.get('GITHUB_ACTIONS'):
        for f in ('.sportstreamy-credentials.env', '.cloudflare-credentials.env'):
            p = Path('/home/kenny/ai/credentials') / f
            if p.exists():
                for line in p.read_text().splitlines():
                    k, _, v = line.strip().partition('=')
                    k = k.replace('export ', '').strip()
                    v = v.strip('"\' ')
                    if k in NAMES and len(v) >= MIN_LEN:
                        vals[f'{f}:{k}'] = v
    return vals


def main():
    args = sys.argv[1:]
    if not args or args[0] not in ('--repo', '--dir'):
        sys.exit(__doc__)
    files = []
    for d in map(Path, args[1:]):
        if args[0] == '--repo':
            out = subprocess.run(['git', 'ls-files'], cwd=d, capture_output=True, text=True, check=True).stdout
            files += [d / f for f in out.split('\n') if f]
        else:
            files += [p for p in d.rglob('*') if p.is_file()]
    vals = values()
    bad = []
    for f in files:
        try:
            data = f.read_bytes()
        except (FileNotFoundError, IsADirectoryError):
            continue
        for name, v in vals.items():
            if v.encode() in data:
                bad.append((str(f), name))
    for f, n in bad:
        print(f'SECRET {n} in {f}')
    print(f'secret check: {len(files)} files, {len(vals)} values, {len(bad)} hits')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()

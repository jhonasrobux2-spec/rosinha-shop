#!/usr/bin/env python3
"""Upload das imagens iniciais para o bucket Supabase rosinha-media.
Uso no Windows PowerShell:
  $env:SUPABASE_URL="https://SEU-PROJETO.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY="SUA_CHAVE_SERVICE_ROLE"
  python scripts/upload_seed_media.py
"""
import os, mimetypes, urllib.request, urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('SUPABASE_URL','').rstrip('/')
KEY=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','')
if not URL or not KEY:
    raise SystemExit('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no terminal antes de executar.')
folder=ROOT/'seed_media'
files=[p for p in folder.iterdir() if p.is_file()]
for n,p in enumerate(files,1):
    mime=mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
    req=urllib.request.Request(f'{URL}/storage/v1/object/rosinha-media/{p.name}',data=p.read_bytes(),method='POST',headers={'apikey':KEY,'Authorization':f'Bearer {KEY}','Content-Type':mime,'x-upsert':'true'})
    try:
        with urllib.request.urlopen(req,timeout=60) as resp: resp.read()
    except urllib.error.HTTPError as e:
        print(f'ERRO {p.name}: HTTP {e.code} {e.read().decode("utf-8", "replace")[:250]}')
        raise SystemExit(1)
    print(f'[{n}/{len(files)}] {p.name}')
print(f'Concluído: {len(files)} imagens enviadas.')

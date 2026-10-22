# Rosinha Shop 🌸 — Netlify + Supabase

Esta pasta contém uma adaptação do projeto para publicar no Netlify com banco de dados e imagens persistentes no Supabase. O layout original (`index.html`, CSS embutido, `data.js` e `matcher.js`) foi mantido.

## Leia primeiro
Abra `GUIA_NETLIFY_SUPABASE.md` e siga as etapas na ordem. Os arquivos `supabase_schema.sql` e `supabase_seed.sql` devem ser executados no SQL Editor do seu projeto Supabase. Depois, envie as imagens iniciais com `scripts/upload_seed_media.py` e configure as variáveis de ambiente no Netlify.

## Arquivos importantes
- `index.html`: interface da loja.
- `netlify/functions/api.mjs`: API de servidor (login, contas, catálogo, estado pessoal, painel admin e upload de imagens).
- `netlify.toml`: configuração do Netlify e redirecionamento de `/api/*` para a função.
- `supabase_schema.sql`: tabelas e bucket de imagens.
- `supabase_seed.sql`: catálogo inicial.
- `seed_media/`: imagens do catálogo inicial.
- `scripts/upload_seed_media.py`: envia as imagens iniciais ao Supabase Storage.

## Variáveis de ambiente necessárias no Netlify
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (segredo, nunca no navegador)
- `ADMIN_USER`
- `ADMIN_PASS`

O ZIP não contém as chaves de nenhum serviço. O site ainda não foi publicado: você precisa conectar sua própria conta Netlify e seu projeto Supabase conforme o guia.

# Rosinha Shop — publicar grátis no Netlify + Supabase

Esta versão mantém o `index.html` e troca o servidor Python por uma Netlify Function. O banco passa a ser PostgreSQL no Supabase e as imagens ficam no Storage.

## 1. Criar o banco
1. Crie um projeto em https://supabase.com/ (plano Free).
2. Abra **SQL Editor → New query**.
3. Cole e execute todo o arquivo `supabase_schema.sql`.
4. Em seguida, execute todo o arquivo `supabase_seed.sql` para carregar os 154 itens e 13 sets iniciais.

## 2. Enviar imagens iniciais
No Supabase, vá a **Project Settings → API** e copie a Project URL e a chave `service_role`/secret. Não compartilhe essa chave nem a coloque no HTML.

No terminal, dentro da pasta do projeto:

### Windows PowerShell
```powershell
$env:SUPABASE_URL="https://SEU-PROJETO.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="SUA_CHAVE_PRIVADA"
python scripts/upload_seed_media.py
```

O script envia as imagens de `seed_media/` ao bucket criado pelo SQL.

## 3. Publicar no Netlify
1. Crie uma conta em https://app.netlify.com/.
2. Coloque esta pasta em um repositório GitHub (pode ser privado) e conecte-o ao Netlify, ou faça deploy por CLI.
3. Build command: deixe vazio. Publish directory: `.`. Functions directory: `netlify/functions` (já definido em `netlify.toml`).
4. Em **Site configuration → Environment variables**, crie:
   - `SUPABASE_URL` = Project URL do Supabase
   - `SUPABASE_SERVICE_ROLE_KEY` = chave privada service role/secret do Supabase
   - `ADMIN_USER` = nome que será usado para entrar no painel admin (3–24 caracteres)
   - `ADMIN_PASS` = senha do admin (use pelo menos 12 caracteres, única e difícil de adivinhar)
5. Faça um novo deploy depois de salvar as variáveis.

## 4. Primeiro acesso
Abra a URL do Netlify. Na aba de conta, entre com o nome definido em `ADMIN_USER` e a senha de `ADMIN_PASS`. O administrador é criado/atualizado no primeiro login válido.

## Importante
- O código não inclui suas chaves privadas. Elas ficam apenas nas variáveis de ambiente do Netlify.
- O banco de usuários, catálogo e estados ficam no Supabase; as imagens ficam no bucket `rosinha-media`.
- Faça backup periódico do banco e das imagens. O plano gratuito tem cotas e pode pausar projetos inativos; verifique os limites atuais no painel do Supabase/Netlify.
- Se o site já tiver contas ou itens cadastrados no antigo `data/rosinha.db`, eles não estão dentro do ZIP enviado. Para migrá-los, precisamos do banco antigo e da pasta `data/media/`.
- A função utiliza a chave `service_role` apenas no backend. Nunca a use em `index.html`, `data.js` ou qualquer arquivo público.

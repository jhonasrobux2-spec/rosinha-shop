import crypto from 'node:crypto';

const SESSION_SECONDS = 60 * 24 * 3600;
const MAX_IMAGE = 2 * 1024 * 1024;
const cleanText = (s, max) => typeof s === 'string' ? s.replace(/[\x00-\x1f\x7f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const num = (x, lo=0, hi=1e7) => {
  if (typeof x === 'boolean' || x === null || x === undefined || x === '') return null;
  const n = Number(x); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : null;
};
const slug = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0,48) || 'item';
const normname = s => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const json = (statusCode, obj) => ({ statusCode, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff', 'referrer-policy':'same-origin' }, body: JSON.stringify(obj) });

function config() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) fail(503, 'O servidor ainda não foi configurado. Confira as variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Netlify.');
  return { url, key };
}
async function rest(table, query='', options={}) {
  const {url,key}=config();
  const method=options.method || 'GET';
  const headers={ apikey:key, authorization:`Bearer ${key}`, 'content-type':'application/json', accept:'application/json' };
  if (options.prefer) headers.prefer=options.prefer;
  const resp=await fetch(`${url}/rest/v1/${table}${query ? `?${query}` : ''}`, {method,headers,body:options.body===undefined?undefined:JSON.stringify(options.body)});
  const txt=await resp.text(); let data=null; try{data=txt?JSON.parse(txt):null}catch{}
  if(!resp.ok){ console.error('Supabase REST error',resp.status,txt.slice(0,500)); fail(500,'Erro ao acessar o banco de dados. Confira o SQL do Supabase e as variáveis do Netlify.'); }
  return data;
}
async function storageUpload(filename, raw, mime) {
  const {url,key}=config();
  const resp=await fetch(`${url}/storage/v1/object/rosinha-media/${encodeURIComponent(filename)}`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':mime,'x-upsert':'true'},body:raw});
  if(!resp.ok){const t=await resp.text();console.error('Storage upload error',resp.status,t.slice(0,300));fail(500,'Não foi possível salvar a imagem. Confira se o bucket rosinha-media existe.');}
  return filename;
}
async function storageDelete(filename) {
  if(!filename || !/^[A-Za-z0-9_.-]+$/.test(filename)) return;
  const {url,key}=config();
  await fetch(`${url}/storage/v1/object/rosinha-media`,{method:'DELETE',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({prefixes:[filename]})}).catch(()=>{});
}
function publicImage(filename) {
  if(!filename) return '';
  const {url}=config(); return `${url}/storage/v1/object/public/rosinha-media/${encodeURIComponent(filename)}`;
}
function passwordHash(password, salt) { return crypto.scryptSync(password, salt, 32, {N:16384,r:8,p:1,maxmem:128*1024*1024}).toString('base64'); }
function equal(a,b) { const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b)); return aa.length===bb.length && crypto.timingSafeEqual(aa,bb); }
function cleanUsername(raw) {
  const name=cleanText(raw,24);
  if(!/^[A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ ._-]{1,22}[A-Za-z0-9À-ÿ]$/.test(name)) fail(400,'Nome de usuário: 3 a 24 caracteres (letras, números, espaço, . _ -).');
  return name;
}
function cleanState(o) {
  if(!o || typeof o!=='object' || Array.isArray(o)) fail(400,'Dados inválidos.');
  const out={price:{},gprice:{},sets:[],inv:{},next:1};
  for(const key of ['price','gprice']) if(o[key] && typeof o[key]==='object' && !Array.isArray(o[key])) for(const [k,v] of Object.entries(o[key]).slice(0,5000)){const n=num(v);if(k.length>0&&k.length<=80&&n!==null)out[key][k]=n;}
  const ids=new Set();
  if(Array.isArray(o.sets)) for(const s of o.sets.slice(0,500)){if(!s||typeof s!=='object')continue;const id=Math.floor(Number(s.id));const name=cleanText(s.name,60);if(!Number.isSafeInteger(id)||id<=0||ids.has(id)||!name)continue;const items=(Array.isArray(s.items)?s.items:[]).filter(x=>typeof x==='string'&&x.length>0&&x.length<=80).slice(0,300);ids.add(id);out.sets.push({id,name,icon:typeof s.icon==='string'&&s.icon.length<=80?s.icon:(items[0]||''),price:num(s.price)||0,items});}
  if(o.inv && typeof o.inv==='object'&&!Array.isArray(o.inv)) for(const [k,v] of Object.entries(o.inv).slice(0,20000)){if(/^(item|set)\|[^|]{1,80}$/.test(k)&&typeof v==='number'&&Number.isFinite(v)){const q=Math.floor(v);if(q>=1&&q<=999999)out.inv[k]=q;}}
  const n=Math.floor(Number(o.next)||1);out.next=Math.max(n,...[...ids].map(x=>x+1),1);return out;
}
function parseImage(dataUrl) {
  if(typeof dataUrl!=='string') fail(400,'Imagem inválida. Use PNG, JPG, WEBP ou GIF.');
  const m=dataUrl.match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/);
  if(!m) fail(400,'Imagem inválida. Use PNG, JPG, WEBP ou GIF.');
  let raw;try{raw=Buffer.from(m[2].replace(/\s/g,''),'base64')}catch{fail(400,'Imagem corrompida.');}
  if(raw.length>MAX_IMAGE)fail(413,'Imagem grande demais (máximo 2 MB).');
  const signatures=[['png',Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])],['jpg',Buffer.from([0xff,0xd8,0xff])],['gif',Buffer.from('GIF8')],['webp',Buffer.from('RIFF')]];
  let ext=null;
  if(raw.subarray(0,8).equals(signatures[0][1]))ext='png';
  else if(raw.subarray(0,3).equals(signatures[1][1]))ext='jpg';
  else if(raw.subarray(0,4).equals(signatures[2][1]))ext='gif';
  else if(raw.subarray(0,4).equals(signatures[3][1])&&raw.subarray(8,12).toString()==='WEBP')ext='webp';
  if(!ext)fail(400,'O arquivo não é uma imagem válida.');
  return {raw,ext,mime:ext==='jpg'?'image/jpeg':`image/${ext}`};
}
async function catalog() {
  const items=await rest('items','select=id,name,price,img&order=name.asc');
  const sets=await rest('sets','select=id,name,icon,price&order=id.asc');
  const joins=await rest('set_items','select=set_id,item_id,sort_order&order=sort_order.asc');
  return {items:(items||[]).map(r=>({id:r.id,name:r.name,price:Number(r.price)||0,img:publicImage(r.img)})),sets:(sets||[]).map(s=>({id:`g${s.id}`,name:s.name,icon:s.icon||'',price:Number(s.price)||0,items:(joins||[]).filter(j=>Number(j.set_id)===Number(s.id)).sort((a,b)=>a.sort_order-b.sort_order).map(j=>j.item_id)}))};
}
function tokenFrom(event){const h=event.headers?.authorization||event.headers?.Authorization||'';return h.startsWith('Bearer ')?h.slice(7).trim():'';}
async function currentUser(event, admin=false) {
  const tok=tokenFrom(event);if(!tok)fail(401,'Faça login.');
  const th=crypto.createHash('sha256').update(tok).digest('hex');
  const rows=await rest('sessions',`select=token_hash,user_id,expires&token_hash=eq.${th}&expires=gt.${Date.now()/1000}&limit=1`);
  if(!rows?.length)fail(401,'Sessão expirada. Entre novamente.');
  const users=await rest('users',`select=id,username,is_admin&id=eq.${rows[0].user_id}&limit=1`);
  const u=users?.[0];if(!u)fail(401,'Sessão expirada. Entre novamente.');
  if(admin&&!u.is_admin)fail(403,'Apenas o administrador pode fazer isso.');return u;
}
async function newSession(uid) {
  const tok=crypto.randomBytes(32).toString('base64url');
  await rest('sessions','',{method:'POST',prefer:'return=minimal',body:{token_hash:crypto.createHash('sha256').update(tok).digest('hex'),user_id:uid,expires:Date.now()/1000+SESSION_SECONDS}});return tok;
}
async function getState(uid) {const rows=await rest('user_state',`select=data&user_id=eq.${uid}&limit=1`);try{return cleanState(rows?.[0]?.data||{});}catch{return cleanState({});}}
async function putState(uid,state) {const st=cleanState(state);await rest('user_state','on_conflict=user_id',{method:'POST',prefer:'resolution=merge-duplicates,return=minimal',body:{user_id:uid,data:st,updated:Date.now()/1000}});}
async function deleteOldImage(oldName) {if(!oldName)return;const used=await rest('items',`select=id&img=eq.${encodeURIComponent(oldName)}&limit=1`);if(!used?.length)await storageDelete(oldName);}
async function adminRoute(method,path,bodyPromise) {
  let m=path.match(/^items(?:\/([A-Za-z0-9_.-]{1,80}))?$/);
  if(m){const iid=m[1];
    if(method==='POST'&&!iid){const b=await bodyPromise; const name=cleanText(b.name,60);const price=num(b.price??0);if(!name)fail(400,'Dê um nome ao item.');if(price===null)fail(400,'Preço inválido.');const all=await rest('items','select=id,name');if(all.some(x=>normname(x.name)===normname(name)))fail(409,'Já existe um item com esse nome.');const base=slug(name);let id=base,n=2;while(all.some(x=>x.id===id)){id=`${base}_${n++}`;}const im=parseImage(b.image);const filename=`${id}-${crypto.randomBytes(4).toString('hex')}.${im.ext}`;await storageUpload(filename,im.raw,im.mime);await rest('items','',{method:'POST',prefer:'return=minimal',body:{id,name,price,img:filename}});return {ok:true,id};}
    const rows=await rest('items',`select=id,name,price,img&id=eq.${encodeURIComponent(iid)}&limit=1`);const r=rows?.[0];if(!r)fail(404,'Item não encontrado.');
    if(method==='PATCH'){const b=await bodyPromise;let name=r.name,price=Number(r.price)||0,img=r.img;if('name'in b){name=cleanText(b.name,60);if(!name)fail(400,'Nome inválido.');const all=await rest('items',`select=id,name&id=neq.${encodeURIComponent(iid)}`);if(all.some(x=>normname(x.name)===normname(name)))fail(409,'Já existe um item com esse nome.');}if('price'in b){price=num(b.price);if(price===null)fail(400,'Preço inválido.');}if(b.image){const im=parseImage(b.image);img=`${iid}-${crypto.randomBytes(4).toString('hex')}.${im.ext}`;await storageUpload(img,im.raw,im.mime);}await rest('items',`id=eq.${encodeURIComponent(iid)}`,{method:'PATCH',prefer:'return=minimal',body:{name,price,img}});if(img!==r.img)await deleteOldImage(r.img);return {ok:true};}
    if(method==='DELETE'){await rest('items',`id=eq.${encodeURIComponent(iid)}`,{method:'DELETE',prefer:'return=minimal'});await deleteOldImage(r.img);const sets=await rest('sets',`select=id,icon&icon=eq.${encodeURIComponent(iid)}`);for(const s of sets||[]){const j=await rest('set_items',`select=item_id&set_id=eq.${s.id}&order=sort_order.asc&limit=1`);await rest('sets',`id=eq.${s.id}`,{method:'PATCH',prefer:'return=minimal',body:{icon:j?.[0]?.item_id||''}});}return {ok:true};}
  }
  m=path.match(/^sets(?:\/(\d{1,9}))?$/);
  if(m){const sid=m[1]?Number(m[1]):null;
    if(method==='POST'&&sid===null){const b=await bodyPromise;const name=cleanText(b.name,60),price=num(b.price??0);if(!name)fail(400,'Dê um nome e escolha itens.');if(price===null)fail(400,'Preço inválido.');if(!Array.isArray(b.items))fail(400,'Dê um nome e escolha itens.');const have=await rest('items','select=id');const ids=[...new Set(b.items.filter(x=>typeof x==='string'&&have.some(i=>i.id===x)))];if(!ids.length)fail(400,'Dê um nome e escolha itens.');const created=await rest('sets','',{method:'POST',prefer:'return=representation',body:{name,price,icon:ids[0]}});const s=created?.[0];if(!s)fail(500,'Não foi possível criar o set.');await rest('set_items','',{method:'POST',prefer:'return=minimal',body:ids.map((item_id,i)=>({set_id:s.id,item_id,sort_order:i}))});return {ok:true,id:`g${s.id}`};}
    const rows=await rest('sets',`select=id,name,price,icon&id=eq.${sid}&limit=1`);const r=rows?.[0];if(!r)fail(404,'Set não encontrado.');
    if(method==='PATCH'){const b=await bodyPromise;let name=r.name,price=Number(r.price)||0;if('name'in b){name=cleanText(b.name,60);if(!name)fail(400,'Nome inválido.');}if('price'in b){price=num(b.price);if(price===null)fail(400,'Preço inválido.');}await rest('sets',`id=eq.${sid}`,{method:'PATCH',prefer:'return=minimal',body:{name,price}});return {ok:true};}
    if(method==='DELETE'){await rest('sets',`id=eq.${sid}`,{method:'DELETE',prefer:'return=minimal'});return {ok:true};}
  }
  fail(404,'Rota não encontrada.');
}
export async function handler(event) {
  let method=event.httpMethod||'GET';
  let path=event.path||'';
  path=path.replace(/^\/.netlify\/functions\/api\/?/,'').replace(/^\/api\/?/,'').replace(/^\//,'').replace(/\/$/,'');
  if(!path)path='';
  try {
    if(method==='OPTIONS')return {statusCode:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','access-control-allow-headers':'Content-Type,Authorization'},body:''};
    const bodyPromise=Promise.resolve().then(()=>{try{const raw=event.body||'{}';if(raw.length>7*1024*1024)fail(413,'Pedido grande demais.');const o=JSON.parse(event.isBase64Encoded?Buffer.from(raw,'base64').toString('utf8'):raw);if(!o||typeof o!=='object'||Array.isArray(o))fail(400,'JSON inválido.');return o;}catch(e){if(e.status)throw e;fail(400,'JSON inválido.');}});
    if(method==='GET'&&path==='catalog')return json(200,await catalog());
    if(method==='POST'&&(path==='login'||path==='register')){
      const b=await bodyPromise;const password=typeof b.password==='string'?b.password:'';const rawName=cleanText(b.username,24);const key=rawName.toLowerCase();
      if(path==='register'){
        const name=cleanUsername(b.username);if(name.toLowerCase()===(process.env.ADMIN_USER||'').trim().toLowerCase())fail(409,'Esse nome é reservado ao administrador.');if(password.length<6||password.length>128)fail(400,'A senha precisa ter de 6 a 128 caracteres.');const salt=crypto.randomBytes(16).toString('base64');const created=await rest('users','',{method:'POST',prefer:'return=representation',body:{username:name,username_lc:name.toLowerCase(),salt,pw_hash:passwordHash(password,Buffer.from(salt,'base64')),is_admin:false,created:Date.now()/1000}}).catch(e=>{if(e.status===500)fail(409,'Esse nome de usuário já existe.');throw e;});const u=created?.[0];const state=cleanState(b.state&&typeof b.state==='object'?b.state:{});await putState(u.id,state);const token=await newSession(u.id);return json(200,{token,user:{name:u.username,admin:false},state});
      }
      if((process.env.ADMIN_USER||'')&&key===(process.env.ADMIN_USER||'').trim().toLowerCase()){
        if(!process.env.ADMIN_PASS||!equal(password,process.env.ADMIN_PASS))fail(401,'Nome ou senha incorretos.');
        let found=await rest('users',`select=id,username,username_lc,salt,pw_hash,is_admin&username_lc=eq.${encodeURIComponent(key)}&limit=1`);let u=found?.[0];if(!u){const salt=crypto.randomBytes(16).toString('base64');const rows=await rest('users','',{method:'POST',prefer:'return=representation',body:{username:cleanUsername(process.env.ADMIN_USER),username_lc:key,salt,pw_hash:passwordHash(process.env.ADMIN_PASS,Buffer.from(salt,'base64')),is_admin:true,created:Date.now()/1000}});u=rows?.[0];}else{const salt=crypto.randomBytes(16).toString('base64');await rest('users',`id=eq.${u.id}`,{method:'PATCH',prefer:'return=minimal',body:{is_admin:true,username:cleanUsername(process.env.ADMIN_USER),salt,pw_hash:passwordHash(process.env.ADMIN_PASS,Buffer.from(salt,'base64'))}});u={...u,username:process.env.ADMIN_USER,is_admin:true};}
        const token=await newSession(u.id);return json(200,{token,user:{name:u.username,admin:true},state:await getState(u.id)});
      }
      const rows=await rest('users',`select=id,username,username_lc,salt,pw_hash,is_admin&username_lc=eq.${encodeURIComponent(key)}&limit=1`);const u=rows?.[0];const salt=u?Buffer.from(u.salt,'base64'):Buffer.alloc(16,48);const expected=u?u.pw_hash:Buffer.alloc(32,49).toString('base64');const ok=equal(passwordHash(password.slice(0,128),salt),expected)&&!!u;if(!ok)fail(401,'Nome ou senha incorretos.');const token=await newSession(u.id);return json(200,{token,user:{name:u.username,admin:!!u.is_admin},state:await getState(u.id)});
    }
    if(method==='POST'&&path==='logout'){const tok=tokenFrom(event);if(tok){const th=crypto.createHash('sha256').update(tok).digest('hex');await rest('sessions',`token_hash=eq.${th}`,{method:'DELETE',prefer:'return=minimal'});}return json(200,{ok:true});}
    if(method==='GET'&&path==='me'){const u=await currentUser(event);return json(200,{user:{name:u.username,admin:!!u.is_admin},state:await getState(u.id)});}
    if(method==='PUT'&&path==='state'){const u=await currentUser(event);const b=await bodyPromise;await putState(u.id,b.state);return json(200,{ok:true});}
    if(path.startsWith('admin/')){await currentUser(event,true);return json(200,await adminRoute(method,path.slice(6),bodyPromise));}
    return json(404,{error:'Rota não encontrada.'});
  } catch(e) { console.error('Rosinha API error:',e?.stack||e);return json(e.status||500,{error:e.status?e.message:'Erro interno do servidor.'}); }
}

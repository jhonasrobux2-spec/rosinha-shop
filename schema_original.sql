-- Catálogo oficial (visível para todos; só o admin altera)
CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, name TEXT NOT NULL, price REAL DEFAULT 0, img TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS sets(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, icon TEXT, price REAL DEFAULT 0);
CREATE TABLE IF NOT EXISTS set_items(set_id INTEGER, item_id TEXT, PRIMARY KEY(set_id,item_id));
-- Contas (senha guardada só como hash scrypt)
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, username_lc TEXT NOT NULL UNIQUE, salt BLOB NOT NULL, pw_hash BLOB NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires REAL NOT NULL);
-- Dados pessoais de cada conta: preços próprios, sets próprios e inventário (JSON validado pelo servidor)
CREATE TABLE IF NOT EXISTS user_state(user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated REAL NOT NULL);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);

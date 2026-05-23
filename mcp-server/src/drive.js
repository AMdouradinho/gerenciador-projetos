// Drive client + persistência de token + cache em memória dos JSONs do ProjectManager.

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Paths ────────────────────────────────────────────────────────────────
const CONFIG_DIR = path.join(os.homedir(), '.config', 'projectmanager-mcp');
export const TOKEN_PATH = path.join(CONFIG_DIR, 'token.json');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const FOLDER_NAME = 'ProjectManager';

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// ─── Config (CLIENT_ID, CLIENT_SECRET) ───────────────────────────────────
export function loadConfig() {
  ensureDir();
  // Prioridade: env vars > config.json
  const env = { clientId: process.env.PM_MCP_CLIENT_ID, clientSecret: process.env.PM_MCP_CLIENT_SECRET };
  if (env.clientId && env.clientSecret) return env;
  if (fs.existsSync(CONFIG_PATH)) {
    try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
    catch (e) { console.error('[drive] config.json corrompido:', e.message); }
  }
  return { clientId: '', clientSecret: '' };
}

export function saveConfig(cfg) {
  ensureDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ─── Token ────────────────────────────────────────────────────────────────
export function loadToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')); }
  catch (e) { console.error('[drive] token.json corrompido:', e.message); return null; }
}

export function saveToken(tokens) {
  ensureDir();
  // Preserva refresh_token mesmo quando o novo response não traz (caso de refresh)
  const existing = loadToken() || {};
  const merged = { ...existing, ...tokens };
  if (!merged.refresh_token && existing.refresh_token) merged.refresh_token = existing.refresh_token;
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
}

// ─── OAuth2 Client autenticado ────────────────────────────────────────────
export function getAuthedClient() {
  const cfg = loadConfig();
  const token = loadToken();
  if (!cfg.clientId || !cfg.clientSecret) throw new Error('Config faltando. Rode `npm run auth` primeiro.');
  if (!token) throw new Error('Token faltando. Rode `npm run auth` primeiro.');
  const oauth2 = new OAuth2Client(cfg.clientId, cfg.clientSecret, `http://localhost:53789/oauth/callback`);
  oauth2.setCredentials(token);
  oauth2.on('tokens', (newTokens) => saveToken(newTokens));
  return oauth2;
}

// ─── Drive helpers ────────────────────────────────────────────────────────
async function findFolder(drive) {
  const res = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
    pageSize: 5
  });
  const files = res.data.files || [];
  if (!files.length) throw new Error(`Pasta "${FOLDER_NAME}" não encontrada no Drive`);
  return files[0];
}

async function listFiles(drive, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/json' and trashed=false`,
    fields: 'files(id,name,modifiedTime)',
    pageSize: 200
  });
  return res.data.files || [];
}

async function readJsonFile(drive, fileId) {
  const res = await drive.files.get({ fileId, alt: 'media' });
  return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
}

// ─── Cache em memória dos dados do ProjectManager ─────────────────────────
let CACHE = null;     // { fetchedAt, folderId, clients, team, projects }
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5min

export async function loadData({ force = false } = {}) {
  if (!force && CACHE && Date.now() - CACHE.fetchedAt < CACHE_TTL_MS) return CACHE;
  const auth = getAuthedClient();
  const drive = google.drive({ version: 'v3', auth });
  const folder = await findFolder(drive);
  const files = await listFiles(drive, folder.id);
  const byName = Object.fromEntries(files.map(f => [f.name, f]));

  // Carrega clients
  let clients = [];
  if (byName['clients.json']) {
    try { const data = await readJsonFile(drive, byName['clients.json'].id); clients = data.clients || []; }
    catch (e) { console.error('[drive] erro lendo clients.json:', e.message); }
  }
  // Carrega team
  let team = { members: [], admins: [] };
  if (byName['team.json']) {
    try { team = await readJsonFile(drive, byName['team.json'].id); }
    catch (e) { console.error('[drive] erro lendo team.json:', e.message); }
  }
  // Carrega projetos (ignora templates e backups)
  const projectFiles = files.filter(f =>
    f.name.endsWith('.json') &&
    !f.name.startsWith('template_') &&
    !f.name.startsWith('pre_migration_backup_') &&
    !f.name.startsWith('team_backup_') &&
    f.name !== 'clients.json' &&
    f.name !== 'team.json'
  );
  const projects = [];
  // Carrega em paralelo, com cap de 8 concorrentes pra não estourar API
  const queue = [...projectFiles];
  const workers = Array(8).fill(null).map(async () => {
    while (queue.length) {
      const f = queue.shift();
      try { const proj = await readJsonFile(drive, f.id); projects.push(proj); }
      catch (e) { console.error('[drive] erro lendo', f.name, ':', e.message); }
    }
  });
  await Promise.all(workers);

  CACHE = { fetchedAt: Date.now(), folderId: folder.id, clients, team, projects };
  return CACHE;
}

export function clearCache() { CACHE = null; }

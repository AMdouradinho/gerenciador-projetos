// Script standalone pra fazer o OAuth flow inicial e salvar refresh token.
// Rode UMA vez: `npm run auth`
// Depois, o servidor MCP reusa o token automaticamente.

import { OAuth2Client } from 'google-auth-library';
import http from 'http';
import url from 'url';
import open from 'open';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, saveToken, TOKEN_PATH } from './drive.js';

const REDIRECT_PORT = 53789;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth/callback`;
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

async function main() {
  const cfg = loadConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    console.error('[auth] CLIENT_ID e CLIENT_SECRET não estão configurados.');
    console.error('[auth] Veja o README.md (seção "Criando OAuth client de Desktop").');
    process.exit(1);
  }

  const oauth2 = new OAuth2Client(cfg.clientId, cfg.clientSecret, REDIRECT_URI);
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',  // força retornar refresh_token mesmo em re-autenticação
    scope: SCOPES
  });

  console.log('[auth] Abrindo navegador pra autorizar...');
  console.log('[auth] URL:', authUrl);

  // Servidor local pra receber callback
  const codePromise = new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const qs = url.parse(req.url, true).query;
        if (!qs.code) {
          res.writeHead(400); res.end('Esperando ?code=...'); return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="font-family:sans-serif;padding:40px;text-align:center">
          <h2>✅ Autorizado!</h2>
          <p>Pode fechar esta aba. O token foi salvo localmente.</p>
        </body></html>`);
        server.close();
        resolve(qs.code);
      } catch (e) { reject(e); }
    });
    server.listen(REDIRECT_PORT, () => {});
  });

  await open(authUrl);
  const code = await codePromise;
  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    console.error('[auth] ⚠ Nenhum refresh_token retornado. Pode estar revogando: revogue manualmente em https://myaccount.google.com/permissions e tente de novo.');
    process.exit(1);
  }
  saveToken(tokens);
  console.log('[auth] ✅ Token salvo em', TOKEN_PATH);
  console.log('[auth] Pronto. Agora você pode rodar o servidor MCP (ou apontar o Claude Desktop pra ele).');
}

main().catch(e => { console.error('[auth] FAIL:', e.message); process.exit(1); });

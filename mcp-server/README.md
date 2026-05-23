# ProjectManager MCP

Servidor MCP (Model Context Protocol) que conecta o **Claude Desktop** ao **ProjectManager** lendo direto seus JSONs do Google Drive. Read-only: o Claude consulta seus dados, nunca modifica.

**O que dá pra perguntar pro Claude depois de instalado:**
- "Como tá o Aldo essa semana?"
- "Briefing pra daily de hoje"
- "Lista tudo que tá atrasado"
- "Escreve um email cobrando o Botuverá do mês"
- "Quanto sobra de banco do Aldo?"

---

## 📦 Instalação

### Pré-requisitos
- **Node.js 18+** instalado (`node --version`)
- **Claude Desktop** (não o Claude.ai web)
- Acesso ao seu Google Drive onde está a pasta `ProjectManager`

### Passo 1 — Criar OAuth Desktop client no Google Cloud

Você já tem 1 client OAuth do app web. Pro Desktop precisa criar outro:

1. Vai em https://console.cloud.google.com/apis/credentials
2. Escolhe o **mesmo projeto** que você usa pro ProjectManager
3. Click **"+ Criar credenciais"** → **"ID do cliente OAuth"**
4. **Tipo do aplicativo**: `Aplicativo da área de trabalho` (Desktop app)
5. **Nome**: `ProjectManager MCP` (ou o que quiser)
6. Click **Criar**
7. Anota o **Client ID** e o **Client Secret** (vai usar no passo 3)

> Se ele pedir pra adicionar `Authorized redirect URIs`, adicione `http://localhost:53789/oauth/callback`.

### Passo 2 — Instalar dependências

```bash
cd mcp-server
npm install
```

### Passo 3 — Configurar credenciais

Crie um arquivo `~/.config/projectmanager-mcp/config.json` (Linux/Mac) ou `%USERPROFILE%\.config\projectmanager-mcp\config.json` (Windows) com:

```json
{
  "clientId": "SEU_CLIENT_ID_AQUI.apps.googleusercontent.com",
  "clientSecret": "SEU_CLIENT_SECRET_AQUI"
}
```

**Ou** export via env var:
```bash
export PM_MCP_CLIENT_ID="..."
export PM_MCP_CLIENT_SECRET="..."
```

### Passo 4 — Autorizar (uma vez)

```bash
npm run auth
```

Abre o navegador, você autoriza o acesso ao Drive, o refresh_token é salvo em `~/.config/projectmanager-mcp/token.json`. Da próxima vez, o servidor já sabe quem é você.

### Passo 5 — Configurar o Claude Desktop

Edita o arquivo de config do Claude Desktop:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`

Adiciona (ou complementa o `mcpServers`):

```json
{
  "mcpServers": {
    "projectmanager": {
      "command": "node",
      "args": ["C:\\caminho\\completo\\pra\\mcp-server\\index.js"]
    }
  }
}
```

Substitua o caminho pelo onde você clonou o repo. **Reinicia o Claude Desktop**.

### Passo 6 — Testar

No Claude Desktop, faz uma pergunta:

> "Lista meus projetos"

Se ele responder com seus projetos reais, está funcionando. ✅

---

## 🛠 Tools disponíveis

| Tool | Pra que serve |
|---|---|
| `pm_refresh` | Limpa cache, recarrega do Drive (use se acabou de mudar algo) |
| `pm_list_projects` | Lista projetos (filtros: cliente, saúde, billingMode) |
| `pm_get_project` | Detalhes completos de 1 projeto |
| `pm_today_activities` | Tasks com prazo hoje + em andamento + próximas N dias |
| `pm_overdue` | Tudo o que tá atrasado, ordenado por gravidade |
| `pm_client_summary` | Saldo banco, receita, projetos, prazos de 1 cliente |
| `pm_daily_briefing` | Markdown pronto pra colar numa daily |

O Claude escolhe a tool certa baseado na sua pergunta. Você não precisa decorar nomes.

---

## 🔍 Como funciona

```
┌─────────────────┐    stdio    ┌──────────────┐    Drive API    ┌──────────┐
│  Claude Desktop │ ◀────────▶ │   MCP Server │ ◀─────────────▶ │  Drive   │
└─────────────────┘             └──────────────┘                 └──────────┘
                                       │
                                       └─ Cache em memória (5min TTL)
```

- Claude faz uma pergunta
- Decide qual tool chamar
- MCP server lê do cache (ou recarrega do Drive se TTL expirou)
- Retorna JSON estruturado
- Claude usa o conteúdo pra formular a resposta em PT-BR

---

## 🛡 Segurança

- **Read-only**: nenhuma tool modifica arquivos no seu Drive
- **Escopo mínimo**: pede só `drive.file` (acesso só aos arquivos que VOCÊ autorizou — não vê todo o seu Drive)
- **Token local**: refresh_token fica no seu computador em `~/.config/projectmanager-mcp/token.json`
- **Sem servidor remoto**: tudo roda local na sua máquina

Pra **revogar**:
1. https://myaccount.google.com/permissions → ProjectManager MCP → Remover
2. Apaga `~/.config/projectmanager-mcp/token.json`

---

## 🐛 Problemas comuns

**"Config faltando. Rode `npm run auth` primeiro."**  
Você ainda não criou o `config.json`. Veja Passo 3.

**"Token faltando."**  
Você criou o config mas ainda não autorizou. Rode `npm run auth`.

**"Pasta ProjectManager não encontrada"**  
A pasta tem outro nome no seu Drive, ou você autorizou com uma conta Google diferente. Re-autorize com a conta certa: apaga `~/.config/projectmanager-mcp/token.json` e roda `npm run auth` de novo.

**Claude Desktop não reconhece o servidor**  
Verifica:
1. O caminho no `claude_desktop_config.json` é absoluto e usa `\\` no Windows
2. `node --version` retorna 18+
3. Você rodou `npm install` na pasta `mcp-server/`
4. Reiniciou o Claude Desktop completamente (não só fechou a janela)

Pra ver logs do MCP no Claude: `~/Library/Logs/Claude/mcp*.log` (Mac) ou `%APPDATA%\Claude\logs\mcp*.log` (Windows).

---

## 🔄 Evoluindo

Quando provar valor, dá pra adicionar tools de **escrita**:
- Criar task avulsa pelo Claude
- Marcar como concluído
- Apontar horas
- Configurar cliente

Hoje é só leitura porque é o caminho mais seguro pra começar.

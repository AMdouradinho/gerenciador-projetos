# Roadmap — ProjectManager

Lista viva de o que está construído, em construção e em fila. Última atualização: **2026-05-21**.

---

## ✅ Entregue

### Core (v3 Pulse, abril/maio 2026)
- Interface Pulse (3 painéis: lista projetos · detalhe · task)
- Status: PENDENTE / EM ANDAMENTO / AGUARDANDO CLIENTE / APROVADO / CONCLUÍDO / BLOQUEADO / OBSOLETA / GATE
- Cronômetro embutido por task + apontamento manual
- Páginas: Foco / Projetos / Kanban / Apontamentos / Faturamento / Relatórios

### Segurança & dados
- 🌐 Visibilidade por projeto (público / restrito / privado) com modal de acesso
- 🆓 Reivindicar projetos órfãos
- ✋ Pegar atividade sem responsável
- Migração automática de schema no Drive (idempotente, com backup pré-migração)
- Backup automático do `team.json` antes de cada save (throttled 5min)
- Confirm + sanity check em remoções de membro

### Status Report
- Gantt por fase com início → fim
- Curva S em % de atividades concluídas (planejado × real)
- Detalhamento por fase com coluna Execução

### Faturamento (admin-only)
- Schema Cliente rico: 3 tipos de cobrança (banco / hourly / fixo)
- Schema Projeto: 3 modos de cobrança (bank / extra / courtesy)
- Página Faturamento com cards por cliente: saldos, receita, margens
- Toggle 🏦/💵/🎁 no header de cada projeto

### Tools
- Atividade avulsa no Kanban (modal contextual)
- Busca global no header (mini command palette)

### Integração externa
- **🤖 MCP Server** (`mcp-server/`): Claude Desktop lê seus projetos do Drive via 7 tools read-only — briefings, status de cliente, atrasadas

---

## 🚧 Em construção (sessão atual)

- **Máscara de ID** auto-gerada (`PREFIX.001`, .002...) baseada em `project.idPrefix`
- **Drag-and-drop** de tasks: reordenar dentro da fase + mover entre fases
- **Cálculo automático de prazos** considerando deps + estimatedHours (8h/dia × seg-sex)
- **Duplicar projeto** pra criar sandbox de testes

---

## 📋 Fila (priorizada)

### 🔴 Alta — uso diário

- **Tools MCP de escrita**: criar task, apontar horas, mudar status pelo Claude Desktop
- **Email pra clientes**: gerar draft de cobrança/relatório mensal a partir dos dados do banco
- **Validação de ciclos em deps**: detectar dependência circular e avisar

### 🟡 Média — qualidade de vida

- **Templates de projeto**: salvar projeto como template + criar a partir de template
- **Multi-usuário real**: pasta compartilhada do Drive entre membros (depende dos donos)
- **Versionamento explícito do projeto**: marco "snapshot v1" pra comparar evolução
- **Dashboard "Banco de horas"**: visão global de todos os clientes hour_bank com alertas

### 🟢 Baixa — melhorias futuras

- **Burndown em ASCII** pro MCP (colar no chat)
- **Status report textual** pelo MCP
- **Notificações** no Claude Desktop quando algo crítico mudar (push via MCP, depende de tooling)
- **Comentários** por task (chat estilo Linear)
- **Anexos** por task (link do Drive)
- **Filtros salvos** (presets de busca no Kanban)
- **Atalhos de teclado** (J/K navegação, E edit, etc)
- **Tema customizado** (cor primária por usuário)

---

## 🧭 Princípios mantidos

- **Read-first**: features novas começam read-only, escrita só depois de provar valor
- **Backward-compat**: toda migração é aditiva (nunca remove/transforma dados existentes sem opt-in)
- **Rollback nativo**: cada release marca snapshot em `backup/` + Drive guarda histórico
- **Sandbox antes de prod**: usar "Duplicar projeto" pra testar features novas
- **Sem CDN próprio**: tudo client-side, hosting via GitHub Pages, dados no Drive do usuário

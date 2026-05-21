# Rollback — ProjectManager

Este documento descreve como **reverter** uma versão deployada caso ela quebre algo. Dois cenários independentes: código (o app HTML servido pelo GitHub Pages) e dados (os JSONs no Google Drive de cada usuário).

---

## 🟦 Cenário 1 — Rollback de código (Pages voltar pra versão anterior)

### Quando usar
- O app deployado está apresentando bug bloqueador
- Você quer voltar pro estado anterior **sem mexer no Drive de ninguém**

### Caminho mais rápido (sem terminal) — ~2 minutos

1. Vá em https://github.com/AMdouradinho/gerenciador-projetos
2. Abra a pasta `backup/`
3. Escolha o snapshot que quer restaurar:
   - **`index_v3_pre_faturamento_2026-05-21.html`** → 🆕 versão imediatamente anterior ao módulo Faturamento (banco de horas, billingMode, +Avulsa Kanban, proteções de team). Tem Status Report turbinado, datas/percentComplete, claim, visibilidade por projeto.
   - **`index_v3_pre_status_report_2026-05-21.html`** → versão anterior ao Status Report turbinado. Tem visibilidade por projeto, claim, fix de busca.
   - **`index_legacy_2025-04-29.html`** → versão V1 original (29/abr/2026). Não recomendado pra rollback rápido, é o estado mais antigo.
4. Click no arquivo → botão **Raw** → "Save as…" no seu computador (ou copie o conteúdo)
5. Volte na raiz do repo, abra `index.html`, click no lápis ✎ para editar
6. Cole o conteúdo do backup por cima de tudo → **Commit changes** → "Rollback to pre-XYZ state"
7. Pages atualiza em ~1 minuto. Ctrl+F5 na URL https://amdouradinho.github.io/gerenciador-projetos/

### Caminho alternativo (terminal, mais limpo)

```bash
git clone https://github.com/AMdouradinho/gerenciador-projetos.git
cd gerenciador-projetos
git log --oneline -10                      # listar commits
git revert <COMMIT_HASH>                   # ex: git revert abc1234 — cria commit reverso
git push origin main
```

Ou rollback duro (apaga histórico — **evite a menos que seja crítico**):

```bash
git reset --hard <COMMIT_HASH_BOM>
git push --force origin main               # ⚠ destrutivo
```

---

## 🟨 Cenário 2 — Rollback de dados no Drive de um usuário

### Quando usar
- Após a migração automática (que adiciona campos novos aos JSONs), algum projeto ficou com dados estranhos
- Você quer voltar **um projeto específico** ao estado anterior à migração

### Como funciona o backup automático
Na primeira abertura após cada migração de schema, o app cria **um arquivo único** no Drive:

```
ProjectManager/
  pre_migration_backup_2026-05-21T15-42-31.json
```

Esse arquivo contém:
- `timestamp`: quando o backup foi feito
- `note`: instrução de uso
- `migratedCount`: quantos projetos foram afetados
- `projects[]`: lista com cópia **integral** de cada `<id>.json` no estado pré-migração

O backup é **idempotente**: o app só cria um por usuário; futuras migrações não sobrescrevem.

### Restaurar 1 projeto específico

1. Abra o Google Drive do usuário
2. Pasta `ProjectManager/`
3. Abra `pre_migration_backup_<timestamp>.json` (visualizar como texto)
4. Localize o projeto pelo `id` (use Ctrl+F)
5. Copie o objeto JSON inteiro daquele projeto (do `{` ao `}` correspondente)
6. Abra o arquivo `<id>.json` na mesma pasta
7. Sobrescreva todo o conteúdo com o objeto copiado
8. Salve

> 💡 No próximo carregamento do app, ele vai detectar que o projeto está com schema antigo e re-aplicar a migração. Se você quer evitar isso, abra o app numa versão antiga (use o Cenário 1 pra fazer rollback de código também).

### Restaurar TODOS os projetos
Repita o passo 4-7 pra cada projeto listado em `projects[]`.

---

## ❓ Decidir qual cenário usar

| Sintoma | Cenário |
|---|---|
| App não carrega · Tela branca · Erro JS no console | 🟦 Código |
| Botão não funciona / layout quebrado | 🟦 Código |
| Projeto aparece com dados errados / tasks sumiram | 🟨 Dados |
| Acabei de migrar e quero voltar a versão antiga "do jeito que estava" | 🟦 Código + 🟨 Dados (faça nesta ordem) |

---

## 🛡 Boas práticas pra futuras releases

- **Antes de qualquer mudança de schema** (adicionar campo na task ou projeto):
  - Confirme que `migrateProject()` adiciona o campo com default seguro (`changed=true`)
  - Garanta que o backup pré-migração ainda dispara (a flag `hasBackup` evita duplicação)
- **Antes de qualquer push pro main**:
  - Crie snapshot do `index.html` atual em `backup/index_v3_pre_<feature>_<data>.html`
  - Atualize esta tabela mencionando o que aquele snapshot preserva
- **Após o push**:
  - Aguarde ~1 min · teste Ctrl+F5 na URL pública
  - Se quebrou, faça rollback pelo Cenário 1 antes de tentar consertar

// Tools MCP — read-only sobre os dados do ProjectManager
import { loadData, clearCache } from './drive.js';
import {
  DONE_STATUSES, taskActualHours, daysUntil, isOverdue, isDepsBlocked,
  getProjectStats, hoursForClient, computeClientFinance, formatHours, brl
} from './helpers.js';

// ─── Helpers de output ────────────────────────────────────────────────────
const ok = (text) => ({ content: [{ type: 'text', text }] });
const okJson = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const err = (msg) => ({ content: [{ type: 'text', text: `❌ ${msg}` }], isError: true });

// ─── Resolvedores ─────────────────────────────────────────────────────────
function findProject(projects, query) {
  if (!query) return null;
  const lq = query.toLowerCase();
  // 1) match exato por id
  let p = projects.find(x => x.id === query);
  if (p) return p;
  // 2) match case-insensitive por nome inteiro
  p = projects.find(x => (x.name || '').toLowerCase() === lq);
  if (p) return p;
  // 3) match parcial por nome
  p = projects.find(x => (x.name || '').toLowerCase().includes(lq));
  return p || null;
}

function findClient(clients, query) {
  if (!query) return null;
  const lq = query.toLowerCase();
  return clients.find(c => (c.name || '').toLowerCase() === lq) ||
         clients.find(c => (c.name || '').toLowerCase().includes(lq)) ||
         null;
}

// ─── Definições MCP (schema das tools) ────────────────────────────────────
export const TOOL_DEFS = [
  {
    name: 'pm_refresh',
    description: 'Força recarregar os dados do Drive (usar se acabou de mudar algo no app).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'pm_list_projects',
    description: 'Lista projetos com filtros opcionais (cliente, status, modo de cobrança).',
    inputSchema: {
      type: 'object',
      properties: {
        client: { type: 'string', description: 'Nome (parcial) do cliente' },
        health: { type: 'string', enum: ['green', 'amber', 'red', 'done'], description: 'Filtra por saúde' },
        billingMode: { type: 'string', enum: ['bank', 'extra', 'courtesy'], description: 'Filtra por modo de cobrança' },
        includeTemplates: { type: 'boolean', description: 'Inclui templates (default false)' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'pm_get_project',
    description: 'Detalhes completos de um projeto (fases, tasks, % concluído, atrasadas, bloqueadas). Aceita ID ou nome (parcial).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'ID exato ou parte do nome' }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'pm_today_activities',
    description: 'Tasks com prazo hoje + em andamento + próximas N dias (default 7). Útil pra daily.',
    inputSchema: {
      type: 'object',
      properties: { upcomingDays: { type: 'number', default: 7, minimum: 1, maximum: 30 } },
      additionalProperties: false
    }
  },
  {
    name: 'pm_overdue',
    description: 'Tasks atrasadas (dueDate < hoje, não concluídas, não obsoletas). Inclui contexto: projeto, fase, responsável, dias de atraso.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'pm_client_summary',
    description: 'Resumo financeiro e operacional de um cliente: saldo do banco, receita do mês, projetos ativos, próximos prazos.',
    inputSchema: {
      type: 'object',
      properties: { client: { type: 'string', description: 'Nome (parcial) do cliente' } },
      required: ['client'],
      additionalProperties: false
    }
  },
  {
    name: 'pm_daily_briefing',
    description: 'Markdown formatado pronto pra colar numa daily: atrasadas, em andamento, próximos prazos, apontamentos recentes, alertas por cliente.',
    inputSchema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD, default hoje' } },
      additionalProperties: false
    }
  }
];

// ─── Implementações ───────────────────────────────────────────────────────
export async function dispatch(name, args = {}) {
  switch (name) {
    case 'pm_refresh': return await toolRefresh();
    case 'pm_list_projects': return await toolListProjects(args);
    case 'pm_get_project': return await toolGetProject(args);
    case 'pm_today_activities': return await toolTodayActivities(args);
    case 'pm_overdue': return await toolOverdue(args);
    case 'pm_client_summary': return await toolClientSummary(args);
    case 'pm_daily_briefing': return await toolDailyBriefing(args);
    default: return err(`Tool desconhecida: ${name}`);
  }
}

async function toolRefresh() {
  clearCache();
  const data = await loadData({ force: true });
  return ok(`✓ Cache atualizado. ${data.projects.length} projetos · ${data.clients.length} clientes · ${data.team.members?.length || 0} membros.`);
}

async function toolListProjects(args) {
  const data = await loadData();
  let list = data.projects.filter(p => args.includeTemplates ? true : !p.isTemplate);
  if (args.client) list = list.filter(p => (p.client || '').toLowerCase().includes(args.client.toLowerCase()));
  if (args.billingMode) list = list.filter(p => (p.billingMode || 'bank') === args.billingMode);
  const enriched = list.map(p => {
    const s = getProjectStats(p);
    return {
      id: p.id, name: p.name, client: p.client || '', type: p.type,
      billingMode: p.billingMode || (p.billable === false ? 'courtesy' : 'bank'),
      stats: s
    };
  });
  if (args.health) {
    const filtered = enriched.filter(p => p.stats.health === args.health);
    return okJson({ total: filtered.length, projects: filtered });
  }
  return okJson({ total: enriched.length, projects: enriched });
}

async function toolGetProject(args) {
  const data = await loadData();
  const proj = findProject(data.projects, args.query);
  if (!proj) return err(`Projeto "${args.query}" não encontrado.`);
  const s = getProjectStats(proj);
  const today = new Date().toISOString().slice(0, 10);
  const phases = (proj.phases || []).map(ph => ({
    id: ph.id, name: ph.name,
    tasks: (ph.tasks || []).map(t => ({
      id: t.id, title: t.title, status: t.status,
      assignee: t.assignee || (t.assigneeEmail ? (data.team.members?.find(m => m.email === t.assigneeEmail)?.name || t.assigneeEmail) : ''),
      startDate: t.startDate || '',
      dueDate: t.dueDate || '',
      completedAt: t.completedAt || '',
      percentComplete: t.percentComplete || 0,
      estimatedHours: t.estimatedHours || 0,
      actualHours: taskActualHours(t),
      isOverdue: isOverdue(t),
      isBlocked: isDepsBlocked(t, proj),
      deps: t.deps || []
    }))
  }));
  return okJson({
    id: proj.id, name: proj.name, client: proj.client || '', type: proj.type,
    billingMode: proj.billingMode || (proj.billable === false ? 'courtesy' : 'bank'),
    visibility: proj.visibility || 'public',
    createdBy: proj.createdBy || '',
    stats: s,
    phases
  });
}

async function toolTodayActivities(args) {
  const data = await loadData();
  const today = new Date().toISOString().slice(0, 10);
  const upcomingLimit = args.upcomingDays || 7;
  const result = { today_due: [], in_progress: [], upcoming: [], overdue: [] };
  for (const p of data.projects) {
    if (p.isTemplate) continue;
    for (const ph of (p.phases || [])) {
      for (const t of (ph.tasks || [])) {
        if (DONE_STATUSES.has(t.status) || t.status === 'OBSOLETA') continue;
        const ctx = { id: t.id, title: t.title, status: t.status, project: p.name, phase: ph.name,
                      assignee: t.assignee || '', dueDate: t.dueDate || '', percentComplete: t.percentComplete || 0 };
        if (isOverdue(t)) result.overdue.push({ ...ctx, daysOverdue: -daysUntil(t.dueDate) });
        else if (t.dueDate === today) result.today_due.push(ctx);
        else if (t.status === 'EM ANDAMENTO') result.in_progress.push(ctx);
        else if (t.dueDate && daysUntil(t.dueDate) <= upcomingLimit) result.upcoming.push({ ...ctx, daysToGo: daysUntil(t.dueDate) });
      }
    }
  }
  result.upcoming.sort((a, b) => a.daysToGo - b.daysToGo);
  result.overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return okJson(result);
}

async function toolOverdue() {
  const data = await loadData();
  const items = [];
  for (const p of data.projects) {
    if (p.isTemplate) continue;
    for (const ph of (p.phases || [])) {
      for (const t of (ph.tasks || [])) {
        if (!isOverdue(t)) continue;
        items.push({
          id: t.id, title: t.title, status: t.status,
          project: p.name, client: p.client || '', phase: ph.name,
          assignee: t.assignee || '',
          dueDate: t.dueDate, daysOverdue: -daysUntil(t.dueDate),
          percentComplete: t.percentComplete || 0,
          deps: t.deps || []
        });
      }
    }
  }
  items.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return okJson({ total: items.length, items });
}

async function toolClientSummary(args) {
  const data = await loadData();
  const client = findClient(data.clients, args.client);
  if (!client) return err(`Cliente "${args.client}" não encontrado.`);
  const fin = computeClientFinance(client, data.projects);
  const clientProjects = data.projects.filter(p => !p.isTemplate && (p.client || '').toLowerCase() === client.name.toLowerCase());
  const projects = clientProjects.map(p => {
    const s = getProjectStats(p);
    return { id: p.id, name: p.name, billingMode: p.billingMode || (p.billable === false ? 'courtesy' : 'bank'), stats: s };
  });
  // Próximos prazos do cliente (não concluídos, próximos 14 dias)
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = [];
  for (const p of clientProjects) {
    for (const ph of (p.phases || [])) {
      for (const t of (ph.tasks || [])) {
        if (DONE_STATUSES.has(t.status) || t.status === 'OBSOLETA') continue;
        if (!t.dueDate) continue;
        const days = daysUntil(t.dueDate);
        if (days < -30 || days > 14) continue;
        upcoming.push({ id: t.id, title: t.title, project: p.name, dueDate: t.dueDate, daysToGo: days, overdue: days < 0 });
      }
    }
  }
  upcoming.sort((a, b) => a.daysToGo - b.daysToGo);
  return okJson({ client: client.name, billing: { ...client, ...fin }, projects, upcoming });
}

async function toolDailyBriefing(args) {
  const data = await loadData();
  const targetDate = args.date || new Date().toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const isToday = targetDate === today;
  const lines = [];
  lines.push(`# 📋 Daily Briefing · ${targetDate}${isToday ? ' (hoje)' : ''}`);
  lines.push('');

  // Atrasadas
  const overdue = [];
  const dueToday = [];
  const inProgress = [];
  const upcoming = [];
  for (const p of data.projects) {
    if (p.isTemplate) continue;
    for (const ph of (p.phases || [])) {
      for (const t of (ph.tasks || [])) {
        if (DONE_STATUSES.has(t.status) || t.status === 'OBSOLETA') continue;
        const ctx = { t, p, ph };
        if (isOverdue(t)) overdue.push({ ...ctx, days: -daysUntil(t.dueDate) });
        else if (t.dueDate === today) dueToday.push(ctx);
        else if (t.status === 'EM ANDAMENTO') inProgress.push(ctx);
        else if (t.dueDate && daysUntil(t.dueDate) <= 7) upcoming.push({ ...ctx, days: daysUntil(t.dueDate) });
      }
    }
  }
  overdue.sort((a, b) => b.days - a.days);
  upcoming.sort((a, b) => a.days - b.days);

  if (overdue.length) {
    lines.push(`## 🔴 Atrasadas (${overdue.length})`);
    overdue.slice(0, 8).forEach(({ t, p, days }) => {
      lines.push(`- **${t.id}** · ${t.title} · _${p.name}_ · vence ${t.dueDate} (há **${days}d**) · ${t.assignee || 'sem dono'}`);
    });
    if (overdue.length > 8) lines.push(`- _…e mais ${overdue.length - 8} atrasadas_`);
    lines.push('');
  }

  if (dueToday.length) {
    lines.push(`## 📅 Vencem hoje (${dueToday.length})`);
    dueToday.forEach(({ t, p }) => {
      lines.push(`- **${t.id}** · ${t.title} · _${p.name}_ · ${t.assignee || 'sem dono'} · ${t.percentComplete || 0}% executado`);
    });
    lines.push('');
  }

  if (inProgress.length) {
    lines.push(`## 🟡 Em andamento (${inProgress.length})`);
    inProgress.slice(0, 8).forEach(({ t, p }) => {
      const pct = t.percentComplete || 0;
      lines.push(`- **${t.id}** · ${t.title} · _${p.name}_ · ${pct}% · ${t.assignee || 'sem dono'}${t.dueDate ? ` · prazo ${t.dueDate}` : ''}`);
    });
    if (inProgress.length > 8) lines.push(`- _…e mais ${inProgress.length - 8}_`);
    lines.push('');
  }

  if (upcoming.length) {
    lines.push(`## 🟢 Próximos 7 dias (${upcoming.length})`);
    upcoming.slice(0, 8).forEach(({ t, p, days }) => {
      lines.push(`- ${days}d · **${t.id}** · ${t.title} · _${p.name}_ · ${t.assignee || 'sem dono'}`);
    });
    lines.push('');
  }

  // Apontamentos do dia anterior (rápido sumário)
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const yestEntries = [];
  for (const p of data.projects) {
    if (p.isTemplate) continue;
    for (const ph of (p.phases || [])) {
      for (const t of (ph.tasks || [])) {
        for (const e of (t.timeEntries || [])) {
          if (e.date === yest) yestEntries.push({ ...e, _proj: p.name, _task: t.title });
        }
      }
    }
  }
  if (yestEntries.length) {
    const byUser = {};
    yestEntries.forEach(e => {
      const k = e.userName || e.userEmail || 'sem-nome';
      byUser[k] = (byUser[k] || 0) + (Number(e.durationHours) || 0);
    });
    lines.push(`## ⏱ Apontamentos de ontem (${yest})`);
    Object.entries(byUser).sort((a, b) => b[1] - a[1]).forEach(([who, h]) => {
      lines.push(`- ${who}: **${formatHours(h)}**`);
    });
    lines.push('');
  }

  // Alerta de banco por cliente
  const bankWarnings = [];
  for (const c of data.clients) {
    if ((c.billingType || 'hourly') !== 'hour_bank') continue;
    const fin = computeClientFinance(c, data.projects);
    if (fin.balance < 0) bankWarnings.push(`- ⚠ **${c.name}** está com saldo de ${formatHours(fin.balance)} (negativo)`);
    else if (fin.balance < (c.monthlyHours || 0) * 0.5) bankWarnings.push(`- 🟡 **${c.name}** com saldo baixo: ${formatHours(fin.balance)} (contratadas ${c.monthlyHours}h/mês)`);
  }
  if (bankWarnings.length) {
    lines.push(`## 💰 Atenção financeira`);
    bankWarnings.forEach(l => lines.push(l));
    lines.push('');
  }

  if (!overdue.length && !dueToday.length && !inProgress.length && !upcoming.length) {
    lines.push('✨ Nada urgente. Aproveita pra fechar tarefa de fundo de gaveta.');
  }

  return ok(lines.join('\n'));
}

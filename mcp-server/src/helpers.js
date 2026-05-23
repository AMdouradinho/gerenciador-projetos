// Helpers de cálculo — reusa lógica do v3 (mantemos paridade com o app)

export const DONE_STATUSES = new Set(['APROVADO', 'APROVADO c/ ressalva', 'CONCLUÍDO']);

export function taskActualHours(t) {
  return (t.timeEntries || []).reduce((s, e) => s + (Number(e.durationHours) || 0), 0);
}

export function daysUntil(dueIso) {
  if (!dueIso) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dueIso + 'T00:00:00');
  return Math.round((d - now) / 86400000);
}

export function isOverdue(task) {
  if (!task.dueDate) return false;
  if (DONE_STATUSES.has(task.status)) return false;
  if (task.status === 'OBSOLETA') return false;
  return task.dueDate < new Date().toISOString().slice(0, 10);
}

export function isDepsBlocked(task, project) {
  if (!task.deps || !task.deps.length) return false;
  const all = (project.phases || []).flatMap(ph => ph.tasks || []);
  return task.deps.some(d => {
    const dep = all.find(x => x.id === d);
    if (!dep) return false;
    return !DONE_STATUSES.has(dep.status) && dep.status !== 'OBSOLETA';
  });
}

export function getProjectStats(project) {
  const tasks = (project.phases || []).flatMap(ph => ph.tasks || []);
  const total = tasks.length;
  const done = tasks.filter(t => DONE_STATUSES.has(t.status)).length;
  const overdue = tasks.filter(t => isOverdue(t)).length;
  const blocked = tasks.filter(t => isDepsBlocked(t, project)).length;
  const est = tasks.reduce((s, t) => s + (Number(t.estimatedHours) || 0), 0);
  const act = tasks.reduce((s, t) => s + taskActualHours(t), 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  let health = 'green';
  if (overdue > 3 || (overdue > 0 && pct < 50)) health = 'red';
  else if (overdue > 0 || blocked > 2) health = 'amber';
  else if (pct === 100) health = 'done';
  return { total, done, overdue, blocked, est, act, pct, health };
}

// Faturamento helpers
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function parseISO(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function monthsBetween(isoStart, now) {
  if (!isoStart) return 0;
  const s = parseISO(isoStart); if (!s) return 0;
  return Math.max(0, (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth()) + 1);
}

export function hoursForClient(projects, clientName, fromIso, toIso, modeFilter) {
  let total = 0;
  for (const p of projects) {
    if ((p.client || '').toLowerCase() !== (clientName || '').toLowerCase()) continue;
    const mode = p.billingMode || (p.billable === false ? 'courtesy' : 'bank');
    if (modeFilter) { if (mode !== modeFilter) continue; }
    else if (mode === 'courtesy') continue;
    for (const ph of (p.phases || [])) {
      for (const t of (ph.tasks || [])) {
        for (const e of (t.timeEntries || [])) {
          if (!e.date) continue;
          if (fromIso && e.date < fromIso) continue;
          if (toIso && e.date > toIso) continue;
          total += Number(e.durationHours) || 0;
        }
      }
    }
  }
  return total;
}

export function computeClientFinance(client, projects, now = new Date()) {
  const t = client.billingType || 'hourly';
  const isoToday = now.toISOString().slice(0, 10);
  const monthStart = startOfMonth(now).toISOString().slice(0, 10);
  const cs = client.contractStart || '';
  const bankMonth = hoursForClient(projects, client.name, monthStart, isoToday, 'bank');
  const bankTotal = hoursForClient(projects, client.name, cs, isoToday, 'bank');
  const extraMonth = hoursForClient(projects, client.name, monthStart, isoToday, 'extra');
  const extraTotal = hoursForClient(projects, client.name, cs, isoToday, 'extra');
  const courtesyMonth = hoursForClient(projects, client.name, monthStart, isoToday, 'courtesy');
  const out = { billingType: t, bankMonth, bankTotal, extraMonth, extraTotal, courtesyMonth,
                monthlyHours: client.monthlyHours || 0, hourlyRate: client.hourlyRate || 0 };
  out.extraMonthRevenue = extraMonth * (client.hourlyRate || 0);
  out.extraTotalRevenue = extraTotal * (client.hourlyRate || 0);
  if (t === 'hour_bank') {
    const months = monthsBetween(cs, now);
    const contracted = (client.monthlyHours || 0) * months;
    out.contractedTotal = contracted;
    out.balance = (Number(client.initialBalance) || 0) + contracted - bankTotal;
    out.monthsElapsed = months;
  } else if (t === 'hourly') {
    out.monthRevenue = (bankMonth + extraMonth) * (client.hourlyRate || 0);
    out.totalRevenue = (bankTotal + extraTotal) * (client.hourlyRate || 0);
  } else if (t === 'fixed') {
    const months = Math.max(1, monthsBetween(cs, now));
    out.monthRevenue = (client.monthlyFee || 0) + out.extraMonthRevenue;
    out.totalRevenue = (client.monthlyFee || 0) * months + out.extraTotalRevenue;
    out.monthCost = (bankMonth + extraMonth) * (client.hourlyRate || 0);
    out.monthMargin = out.monthRevenue - out.monthCost;
    out.diffHours = bankMonth - (client.monthlyHours || 0);
  }
  return out;
}

export function formatHours(h) {
  if (h === undefined || h === null) return '—';
  const v = Number(h);
  if (Number.isNaN(v)) return '—';
  if (Math.abs(v) < 0.05) return '0h';
  return v.toFixed(1).replace(/\.0$/, '') + 'h';
}

export function brl(n) {
  return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

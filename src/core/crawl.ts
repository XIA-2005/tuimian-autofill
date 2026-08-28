// 插件爬取与登录后会话爬取：只保存结构化快照，不长期保存原始 HTML。

import { matchAdapterPackage, matchAdapterPage, fingerprintDocument, isCrawlPathBlocked, SCHOOL_ADAPTER_PACKAGES } from './adapter-packages';
import { SchoolAdapterPackage } from './adapters';
import { importFromPage } from './importer';
import { FIELD_RULES, FieldRule } from './matcher';
import { AtomicTableId, PendingClassification, Profile, ProfileCodebookEntry, ProfileRowState, emptyProfile, getByPath, isProfileFieldLocked, normalizeProfile, setByPath, writeProfileValue } from './profile';

const CRAWL_SESSION_KEY = 'crawlSessionV2';

const SCALAR_PATHS = [
  'basic.name', 'basic.namePinyin', 'basic.gender', 'basic.idType', 'basic.idCard', 'basic.birthday', 'basic.nation', 'basic.politicalStatus', 'basic.hometown', 'basic.birthPlace', 'basic.hukou', 'basic.country', 'basic.address', 'basic.postalCode', 'basic.phone', 'basic.landline', 'basic.email', 'basic.qq', 'basic.wechat', 'basic.maritalStatus', 'basic.health', 'basic.emergencyName', 'basic.emergencyPhone', 'basic.tuimianQual', 'basic.militaryStatus',
  'education.university', 'education.province', 'education.college', 'education.major', 'education.className', 'education.studentId', 'education.startDate', 'education.endDate', 'education.gpa', 'education.score', 'education.rank', 'education.comprehensiveRank', 'education.gradeRank', 'education.rankBase', 'education.rankUnit', 'education.foreignLang', 'education.cet4', 'education.cet4Date', 'education.cet6', 'education.cet6Date', 'education.otherExams', 'education.obeyAdjust',
] as const;

const ATOMIC_TABLES: AtomicTableId[] = ['academicPapers', 'academicPatents', 'academicProjects', 'academicCompetitions', 'honorsScholarships', 'internships', 'socialService', 'studentWorkExperiences'];

export interface CrawlSnapshot {
  id: string;
  adapterId: string;
  schoolName: string;
  pageId: string;
  pageName: string;
  url: string;
  fingerprint: string;
  capturedAt: string;
  values: Record<string, string>;
  codebook: Record<string, ProfileCodebookEntry>;
  tables: Partial<Record<AtomicTableId, any[]>>;
  pendingClassifications?: PendingClassification[];
  warnings: string[];
}

export interface CrawlSession {
  schemaVersion: 1;
  adapterId: string;
  schoolName: string;
  programName: string;
  startedAt: string;
  updatedAt: string;
  expectedPages: string[];
  snapshots: Record<string, CrawlSnapshot>;
  selectedApplicationKey?: string;
}

export interface ApplicationChoice {
  key: string;
  label: string;
}

/** 从报名记录选择页提取脱敏选项；只保存行签名，不保存链接查询参数。 */
export function applicationChoicesFromPage(doc: Document): ApplicationChoice[] {
  const choices: ApplicationChoice[] = [];
  for (const row of Array.from(doc.querySelectorAll('table tr'))) {
    const action = row.querySelector('a[href],button,[data-id]') as HTMLElement | null;
    if (!action) continue;
    const label = (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!label || /报名记录|项目名称|操作/.test(label) && row.querySelectorAll('td').length === 0) continue;
    const signature = `${label}|${action.getAttribute('href') || ''}|${action.getAttribute('data-id') || ''}`;
    choices.push({ key: `application_${hash(signature)}`, label });
  }
  return choices.filter((choice, index) => choices.findIndex((x) => x.key === choice.key) === index);
}

/** 一行自动选择；多行必须给出用户确认的索引，且已有选择不会被静默替换。 */
export function rememberApplicationChoice(session: CrawlSession, choices: ApplicationChoice[], confirmedIndex?: number): CrawlSession {
  if (!choices.length) return session;
  if (session.selectedApplicationKey && choices.some((choice) => choice.key === session.selectedApplicationKey) && confirmedIndex === undefined) return session;
  if (choices.length > 1 && (confirmedIndex === undefined || confirmedIndex < 0 || confirmedIndex >= choices.length)) throw new Error('存在多条报名记录，必须由用户确认选择');
  const selected = choices[choices.length === 1 ? 0 : confirmedIndex!];
  if (session.selectedApplicationKey && session.selectedApplicationKey !== selected.key && confirmedIndex === undefined) throw new Error('报名记录与已选分支不一致，已停止切换');
  return { ...session, selectedApplicationKey: selected.key, updatedAt: new Date().toISOString() };
}

export interface CrawlMergeItem {
  kind: 'new' | 'same' | 'conflict' | 'locked';
  path: string;
  currentValue: string;
  incomingValue: string;
  snapshotId: string;
}

export interface CrawlMergePreview {
  items: CrawlMergeItem[];
  newRows: Partial<Record<AtomicTableId, any[]>>;
  duplicateRows: number;
  lockedRows: number;
  pendingClassifications: PendingClassification[];
}

function hash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function rowIdentity(table: AtomicTableId, row: Record<string, unknown>): string {
  const values = table.startsWith('academic')
    ? [row.kind, row.title || row.name, row.start || row.time, row.end, row.source || row.issuer]
    : table === 'honorsScholarships'
      ? [row.kind, row.name, row.time, row.issuer || row.place]
      : [row.kind, row.org, row.start, row.end, row.role];
  return hash(values.map((x) => String(x || '').trim()).join('|'));
}

function captureCodes(doc: Document, values: Record<string, string>, rules: FieldRule[]): Record<string, ProfileCodebookEntry> {
  const out: Record<string, ProfileCodebookEntry> = {};
  for (const select of Array.from(doc.querySelectorAll('select'))) {
    const selected = select.selectedOptions?.[0];
    if (!selected || !selected.value || !selected.textContent?.trim() || selected.value === selected.textContent.trim()) continue;
    const hay = `${select.id} ${select.getAttribute('name') || ''} ${select.labels?.[0]?.textContent || ''}`.toLowerCase();
    const rule = rules.find((r) => r.keywords.some((k) => hay.includes(k.toLowerCase())) || r.attrOnly?.some((k) => hay.includes(k.toLowerCase())));
    if (!rule || !values[rule.field]) continue;
    out[rule.field] = { label: selected.textContent.trim().replace(/^\s*\d+[|\s-]*/, ''), codes: { page: selected.value }, updatedAt: new Date().toISOString() };
  }
  return out;
}

export function captureCurrentPage(doc: Document, url: string, rules: FieldRule[] = FIELD_RULES, packages: SchoolAdapterPackage[] = SCHOOL_ADAPTER_PACKAGES): CrawlSnapshot {
  const adapter = matchAdapterPackage(url, packages);
  if (!adapter) throw new Error('当前页面没有声明式适配包，已停止采集');
  if (isCrawlPathBlocked(adapter, url)) throw new Error('当前页面命中登录、注册、上传、打印、结果或提交门禁，已停止采集');
  const pageMatch = matchAdapterPage(adapter, doc, url);
  if (!pageMatch.allowed || !pageMatch.page) throw new Error(pageMatch.reason);
  const temp = emptyProfile();
  const imported = importFromPage(temp, doc, rules);
  const normalized = normalizeProfile(temp);
  const values: Record<string, string> = {};
  for (const path of SCALAR_PATHS) {
    const value = String(getByPath(normalized, path) || '').trim();
    if (value) values[path] = value;
  }
  const tables: Partial<Record<AtomicTableId, any[]>> = {};
  for (const id of ATOMIC_TABLES) if (normalized[id].length) tables[id] = normalized[id].map((row: any) => ({ ...row, state: { ...(row.state || {}), source: 'crawl', sourceAdapterId: adapter.id, sourcePageId: pageMatch.page!.id, locked: false, confidence: 'inferred', updatedAt: new Date().toISOString() } }));
  const now = new Date().toISOString();
  return {
    id: `snapshot_${hash(`${adapter.id}|${pageMatch.page.id}|${url}|${now}`)}`,
    adapterId: adapter.id,
    schoolName: adapter.schoolName,
    pageId: pageMatch.page.id,
    pageName: pageMatch.page.name,
    url,
    fingerprint: pageMatch.fingerprint || fingerprintDocument(doc),
    capturedAt: now,
    values,
    codebook: captureCodes(doc, values, rules),
    tables,
    pendingClassifications: normalized.pendingClassifications,
    warnings: imported.summary.length ? [] : ['页面未提取到可识别字段'],
  };
}

export function createCrawlSession(adapter: SchoolAdapterPackage): CrawlSession {
  const now = new Date().toISOString();
  return { schemaVersion: 1, adapterId: adapter.id, schoolName: adapter.schoolName, programName: adapter.programName, startedAt: now, updatedAt: now, expectedPages: [...adapter.crawl.pageOrder], snapshots: {} };
}

export function addSnapshot(session: CrawlSession | undefined, snapshot: CrawlSnapshot, adapter?: SchoolAdapterPackage): CrawlSession {
  const target = session && session.adapterId === snapshot.adapterId ? { ...session, snapshots: { ...session.snapshots } } : createCrawlSession(adapter || SCHOOL_ADAPTER_PACKAGES.find((p) => p.id === snapshot.adapterId)!);
  target.snapshots[snapshot.pageId] = snapshot;
  target.updatedAt = new Date().toISOString();
  return target;
}

export async function loadCrawlSession(): Promise<CrawlSession | undefined> {
  try {
    const storage = chrome.storage.session || chrome.storage.local;
    const raw = await storage.get(CRAWL_SESSION_KEY);
    const value = raw?.[CRAWL_SESSION_KEY] as CrawlSession | undefined;
    return value && value.schemaVersion === 1 ? value : undefined;
  } catch { return undefined; }
}

export async function saveCrawlSession(session: CrawlSession): Promise<void> {
  const storage = chrome.storage.session || chrome.storage.local;
  await storage.set({ [CRAWL_SESSION_KEY]: session });
}

export async function clearCrawlSession(): Promise<void> {
  const storage = chrome.storage.session || chrome.storage.local;
  await storage.remove(CRAWL_SESSION_KEY);
}

export function previewCrawlMerge(profile: Profile, session: CrawlSession): CrawlMergePreview {
  const items: CrawlMergeItem[] = [];
  const newRows: Partial<Record<AtomicTableId, any[]>> = {};
  let duplicateRows = 0;
  let lockedRows = 0;
  const pendingClassifications: PendingClassification[] = [];
  for (const snapshot of Object.values(session.snapshots)) {
    for (const [path, incomingValue] of Object.entries(snapshot.values)) {
      const currentValue = String(getByPath(profile, path) || '');
      const locked = isProfileFieldLocked(profile, path);
      const kind: CrawlMergeItem['kind'] = locked && currentValue.trim() !== incomingValue.trim() ? 'locked' : !currentValue.trim() ? 'new' : currentValue.trim() === incomingValue.trim() ? 'same' : 'conflict';
      items.push({ kind, path, currentValue, incomingValue, snapshotId: snapshot.id });
    }
    for (const table of ATOMIC_TABLES) {
      const incoming = snapshot.tables[table] || [];
      if (!incoming.length) continue;
      const existing = profile[table] as any[];
      const identities = new Set(existing.map((row) => rowIdentity(table, row)));
      for (const row of incoming) {
        const id = rowIdentity(table, row);
        const match = existing.find((x) => rowIdentity(table, x) === id);
        if (identities.has(id)) {
          duplicateRows++;
          if ((match?.state as ProfileRowState | undefined)?.locked) lockedRows++;
          continue;
        }
        (newRows[table] ||= []).push(row);
        identities.add(id);
      }
    }
    for (const pending of snapshot.pendingClassifications || []) {
      if (!profile.pendingClassifications.some((item) => item.id === pending.id) && !pendingClassifications.some((item) => item.id === pending.id)) pendingClassifications.push(pending);
    }
  }
  return { items, newRows, duplicateRows, lockedRows, pendingClassifications };
}

export function commitCrawlMerge(profile: Profile, session: CrawlSession, options: { acceptConflicts?: string[]; lockImported?: boolean } = {}): CrawlMergePreview {
  const preview = previewCrawlMerge(profile, session);
  const accepted = new Set(options.acceptConflicts || []);
  for (const item of preview.items) {
    if (item.kind === 'new' || (item.kind === 'conflict' && accepted.has(item.path))) {
      if (item.kind === 'conflict') setByPath(profile, item.path, '');
      const snapshot = Object.values(session.snapshots).find((x) => x.id === item.snapshotId);
      writeProfileValue(profile, item.path, item.incomingValue, 'crawl', session.adapterId, snapshot?.pageId);
      if (options.lockImported && profile.fieldStates[item.path]) profile.fieldStates[item.path].locked = true;
    }
  }
  for (const table of ATOMIC_TABLES) {
    const rows = preview.newRows[table] || [];
    if (!rows.length || profile.blockLocks[table]) continue;
    const target = profile[table] as any[];
    for (const row of rows) {
      const state = { ...(row.state || {}), locked: !!options.lockImported, source: 'crawl', sourceAdapterId: session.adapterId, updatedAt: new Date().toISOString() };
      target.push({ ...row, state });
    }
  }
  for (const snapshot of Object.values(session.snapshots)) {
    for (const [path, rec] of Object.entries(snapshot.codebook)) {
      if (profile.fieldStates[path]?.locked && profile.codebook[path]) continue;
      profile.codebook[path] = { ...rec, codes: { ...(profile.codebook[path]?.codes || {}), ...rec.codes }, sourceAdapterId: session.adapterId };
    }
  }
  profile.pendingClassifications.push(...preview.pendingClassifications);
  return preview;
}

export interface SessionCrawlResult {
  session: CrawlSession;
  fetched: number;
  failures: Array<{ path: string; reason: string }>;
}

export interface SessionCrawlOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** 请求之间的最小间隔，避免对报名系统造成压力。 */
  minIntervalMs?: number;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('用户已取消爬取')); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('用户已取消爬取')); }, { once: true });
  });
}

/**
 * 使用当前登录会话读取适配包声明的同源只读页面。禁止任意 URL、保存、删除和提交接口。
 */
export async function crawlDeclaredReadOnlyPages(adapter: SchoolAdapterPackage, currentUrl: string, fetcher: typeof fetch = fetch, options: SessionCrawlOptions = {}): Promise<SessionCrawlResult> {
  if (adapter.crawl.mode !== 'session' || !adapter.crawl.readOnlyPaths?.length) throw new Error('该适配包没有声明会话爬取页面');
  const origin = new URL(currentUrl).origin;
  let session = createCrawlSession(adapter);
  const failures: Array<{ path: string; reason: string }> = [];
  let fetched = 0;
  const timeoutMs = Math.max(1000, Math.min(options.timeoutMs || 12000, 60000));
  const intervalMs = Math.max(0, Math.min(options.minIntervalMs ?? 350, 5000));
  for (let pathIndex = 0; pathIndex < adapter.crawl.readOnlyPaths.length; pathIndex++) {
    const path = adapter.crawl.readOnlyPaths[pathIndex];
    if (options.signal?.aborted) throw new Error('用户已取消爬取');
    if (/logout|delete|remove|submit|save|commit|finish/i.test(path)) { failures.push({ path, reason: '路径命中写操作禁用词' }); continue; }
    try {
      const url = new URL(path, origin);
      if (url.origin !== origin) throw new Error('跨源地址被拒绝');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      let response: Response;
      try {
        response = await fetcher(url.href, { method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'follow', signal: controller.signal });
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', abort);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const snapshot = captureCurrentPage(doc, url.href, FIELD_RULES, [adapter]);
      session = addSnapshot(session, snapshot, adapter);
      fetched++;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push({ path, reason: /abort/i.test(reason) ? '请求超时或已取消' : reason });
    }
    if (pathIndex < adapter.crawl.readOnlyPaths.length - 1 && intervalMs) await delay(intervalMs, options.signal);
  }
  await saveCrawlSession(session);
  return { session, fetched, failures };
}

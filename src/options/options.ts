import { ATOMIC_TABLE_IDS, AtomicTableId, canLockProfileRow, classifyPendingRecord, createRowState, emptyProfile, getByPath, moveAtomicRow, normalizeProfile, Profile, setProfileFieldLock, writeProfileValue } from '../core/profile';
import { loadProfile, saveProfile } from '../core/storage';
import { generateTestProfile } from '../core/testdata';
import { DEFAULT_RULES_URL, loadSettings, saveSettings } from '../core/rulesync';

interface ListDef {
  cols: Record<string, string>;
  textarea?: string[];
}

const LIST_DEFS: Record<string, ListDef> = {
  academicPapers: { cols: { kind: '类型', end: '发表时间', title: '论文/著作标题', source: '刊物/会议/出版社', role: '作者排名', authors: '全部作者', itemType: '论文/著作类型', status: '发表状态', level: '刊物级别', partition: '分区', summary: '摘要/说明', advisor: '指导教师' }, textarea: ['summary'] },
  academicPatents: { cols: { kind: '类型', end: '授权/受理时间', title: '专利/软著名称', source: '权利人/登记主体', role: '本人排名/角色', authors: '发明人/著作权人', itemType: '成果类型', status: '状态', level: '级别', summary: '说明', advisor: '指导教师' }, textarea: ['summary'] },
  academicProjects: { cols: { kind: '类型', start: '开始时间', end: '结束时间', title: '项目名称', source: '项目来源', role: '本人角色/排名', level: '项目级别', itemType: '项目类别', status: '项目状态', authors: '参与成员', summary: '主要贡献/说明', advisor: '指导教师' }, textarea: ['summary'] },
  academicCompetitions: { cols: { kind: '类型', time: '获奖时间', name: '竞赛/项目名称', issuer: '主办单位', place: '地点', level: '奖项级别', grade: '奖项等级', rank: '本人位次', content: '说明' }, textarea: ['content'] },
  honorsScholarships: { cols: { kind: '类型', time: '获奖时间', name: '荣誉/奖学金名称', issuer: '颁发单位', place: '地点', level: '奖项级别', grade: '奖项等级', rank: '本人位次', content: '获奖原因/说明' }, textarea: ['content'] },
  internships: { cols: { kind: '类型', start: '开始时间', end: '结束时间', org: '实习单位', role: '岗位/职务', place: '地点', content: '主要工作内容' }, textarea: ['content'] },
  socialService: { cols: { kind: '类型', start: '开始时间', end: '结束时间', org: '实践/服务单位', role: '担任职务', place: '地点', content: '主要内容' }, textarea: ['content'] },
  studentWorkExperiences: { cols: { kind: '类型', start: '开始时间', end: '结束时间', org: '学校/单位/组织', role: '担任职务', place: '地点', content: '主要内容' }, textarea: ['content'] },
  languageExams: { cols: { kind: '考试类型', score: '成绩', date: '取得时间', level: '等级', certificateNo: '证书编号' } },
  computerCertificates: { cols: { kind: '证书类型', level: '等级', score: '成绩', date: '取得时间', certificateNo: '证书编号' } },
  essays: { cols: { kind: '长文类型', content: '正文', charLimit: '目标字数上限' }, textarea: ['content'] },
  familyMembers: { cols: { name: '姓名', relation: '与本人关系', org: '工作单位', jobTitle: '职务', politicalStatus: '政治面貌', phone: '联系电话', address: '通讯地址' } },
  applications: { cols: { school: '学校', programType: '项目类型', year: '年度', college: '申请学院', major: '专业', direction: '研究方向', degreeType: '学位类型', supervisor: '意向导师', schoolCode: '学校代码', collegeCode: '学院代码', majorCode: '专业代码', directionCode: '方向代码', note: '备注' }, textarea: ['note'] },
};

const ATOMIC_TABLE_NAMES: Record<AtomicTableId, string> = {
  academicPapers: '论文/著作', academicPatents: '专利/软著', academicProjects: '科研项目', academicCompetitions: '竞赛', honorsScholarships: '荣誉/奖学金', internships: '实习', socialService: '社会实践/志愿服务', studentWorkExperiences: '学生工作/学习工作经历',
};

let state: Profile = emptyProfile();
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showToast(text: string): void {
  const toast = document.getElementById('toast') as HTMLElement;
  toast.textContent = text;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function rowHasValue(item: Record<string, unknown>, def: ListDef): boolean {
  return Object.keys(def.cols).some((col) => String(item[col] ?? '').trim());
}

function renderList(key: string, items: Array<Record<string, any>>): void {
  const container = document.getElementById('list-' + key) as HTMLElement | null;
  if (!container) return;
  container.innerHTML = '';
  const def = LIST_DEFS[key];
  items.forEach((item, i) => {
    const row = document.createElement('div');
    const locked = !!state.blockLocks[key] || !!item.state?.locked;
    row.className = locked ? 'row is-locked' : 'row';
    for (const [col, label] of Object.entries(def.cols)) {
      const isArea = def.textarea ? def.textarea.includes(col) : false;
      const field = document.createElement('label');
      field.className = 'col';
      field.textContent = label;
      const ctrl = document.createElement(isArea ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement;
      ctrl.dataset.lpath = `${key}.${i}.${col}`;
      ctrl.value = String(item[col] ?? '');
      ctrl.disabled = locked;
      if (isArea) (ctrl as HTMLTextAreaElement).rows = 4;
      if (!isArea) ctrl.placeholder = label;
      field.appendChild(ctrl);
      row.appendChild(field);
    }
    const lock = document.createElement('button');
    lock.type = 'button';
    lock.className = 'row-lock';
    lock.textContent = locked ? '🔒 解锁本行' : '🔓 锁定本行';
    lock.disabled = !!state.blockLocks[key];
    lock.addEventListener('click', () => {
      collectToState();
      const arr = (state as unknown as Record<string, Array<Record<string, any>>>)[key];
      const current = arr[i] || {};
      if (!current.state?.locked && !canLockProfileRow(current)) {
        showToast('空行、非法日期或占位测试数据不能锁定');
        return;
      }
      current.state = { ...(current.state || createRowState('manual', `${key}|${i}`)), locked: !current.state?.locked, source: current.state?.source || 'manual', updatedAt: new Date().toISOString(), confidence: current.state?.confidence || 'verified' };
      renderList(key, arr);
    });
    row.appendChild(lock);
    if (ATOMIC_TABLE_IDS.includes(key as AtomicTableId)) {
      const moveSelect = document.createElement('select');
      moveSelect.className = 'row-move-select';
      for (const target of ATOMIC_TABLE_IDS) {
        if (target === key) continue;
        const option = document.createElement('option');
        option.value = target;
        option.textContent = `移至：${ATOMIC_TABLE_NAMES[target]}`;
        moveSelect.appendChild(option);
      }
      moveSelect.disabled = locked;
      const moveButton = document.createElement('button');
      moveButton.type = 'button';
      moveButton.className = 'row-move';
      moveButton.textContent = '移动';
      moveButton.disabled = locked;
      moveButton.addEventListener('click', () => {
        collectToState();
        if (moveAtomicRow(state, key as AtomicTableId, i, moveSelect.value as AtomicTableId)) {
          renderAll();
          showToast('已移动到目标原子表并锁定');
        }
      });
      row.append(moveSelect, moveButton);
    }
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'row-del';
    del.textContent = '删除';
    del.disabled = locked;
    del.addEventListener('click', () => {
      collectToState();
      const arr = (state as unknown as Record<string, Array<Record<string, any>>>)[key];
      arr.splice(i, 1);
      renderList(key, arr);
    });
    row.appendChild(del);
    container.appendChild(row);
  });
}

function renderAll(): void {
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-field]').forEach((el) => {
    el.value = String(getByPath(state, el.dataset.field!) ?? '');
  });
  for (const key of Object.keys(LIST_DEFS)) {
    renderList(key, (state as unknown as Record<string, Array<Record<string, any>>>)[key] || []);
  }
  decorateScalarLocks();
  refreshBlockLocks();
  refreshMigrationBanner();
  renderPendingClassifications();
  refreshMissingBanner();
}

function renderPendingClassifications(): void {
  const card = document.getElementById('pendingCard') as HTMLElement | null;
  const list = document.getElementById('pendingList') as HTMLElement | null;
  if (!card || !list) return;
  card.hidden = !state.pendingClassifications.length && state.migration.confirmed;
  list.innerHTML = '';
  state.pendingClassifications.forEach((pending) => {
    const row = document.createElement('div');
    row.className = 'pending-row';
    const summary = document.createElement('span');
    const original = pending.original;
    summary.textContent = String(original.title || original.name || original.content || '未命名记录');
    const select = document.createElement('select');
    pending.candidates.forEach((candidate) => {
      const option = document.createElement('option');
      option.value = candidate;
      option.textContent = LIST_DEFS[candidate] ? Object.values(LIST_DEFS[candidate].cols)[2] || candidate : candidate;
      select.appendChild(option);
    });
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'add';
    button.textContent = '归类并锁定';
    button.addEventListener('click', () => {
      if (classifyPendingRecord(state, pending.id, select.value as any)) {
        renderAll();
        showToast('已归类并锁定该记录');
      }
    });
    row.append(summary, select, button);
    list.appendChild(row);
  });
}

/** 为标量字段补充锁定按钮。手工修改并离开字段后立即写入并锁定。 */
function decorateScalarLocks(): void {
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-field]').forEach((el) => {
    const path = el.dataset.field!;
    const locked = !!state.fieldStates[path]?.locked;
    el.disabled = locked;
    const label = el.closest('label');
    if (!label) return;
    label.querySelector('.scalar-lock')?.remove();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scalar-lock';
    btn.textContent = locked ? '🔒 解锁' : '🔓 未锁';
    btn.addEventListener('click', () => {
      if (locked) {
        setProfileFieldLock(state, path, false);
        el.disabled = false;
        renderAll();
        (document.querySelector(`[data-field="${path}"]`) as HTMLElement | null)?.focus();
      } else if (setProfileFieldLock(state, path, true)) {
        renderAll();
      } else {
        showToast('空值不能锁定');
      }
    });
    label.appendChild(btn);
    el.addEventListener('change', () => {
      if (el.disabled) return;
      const result = writeProfileValue(state, path, el.value, 'manual');
      if (result.ok && el.value.trim()) renderAll();
    }, { once: true });
  });
}

function refreshBlockLocks(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-lock-block]').forEach((btn) => {
    const key = btn.dataset.lockBlock!;
    const locked = !!state.blockLocks[key];
    btn.textContent = locked ? '🔒 解锁整表' : '🔓 锁定整表';
    btn.classList.toggle('locked', locked);
  });
}

function refreshMigrationBanner(): void {
  const banner = document.getElementById('migrationBanner') as HTMLElement | null;
  if (!banner) return;
  const pending = state.pendingClassifications.length;
  const migrated = !state.migration.confirmed;
  banner.hidden = !pending && !migrated;
  banner.textContent = pending
    ? `旧档案已无损迁移；有 ${pending} 条科研记录类型不明确，已放入待分类且不会参与自动填表。旧版四表备份仍保留。`
    : migrated ? '旧档案已迁移到八类原子表，旧版四表备份仍保留。' : '';
}

/** 常用关键信息缺失提醒：点条目直接跳到对应输入框 */
const KEY_FIELDS: Array<{ path: string; label: string }> = [
  { path: 'basic.name', label: '姓名' },
  { path: 'basic.idCard', label: '身份证号' },
  { path: 'basic.phone', label: '手机号码' },
  { path: 'basic.email', label: '电子邮箱' },
  { path: 'education.university', label: '本科学校' },
  { path: 'education.major', label: '专业' },
  { path: 'education.studentId', label: '学号' },
  { path: 'education.cet4', label: '英语四级成绩' },
  { path: 'education.cet4Date', label: '四级取得时间' },
  { path: 'education.cet6', label: '英语六级成绩' },
  { path: 'education.cet6Date', label: '六级取得时间' },
  { path: 'education.obeyAdjust', label: '是否服从专业调剂' },
];

function refreshMissingBanner(): void {
  const banner = document.getElementById('missingBanner') as HTMLElement;
  const missing = KEY_FIELDS.filter((k) => {
    const v = getByPath(state, k.path);
    return v == null || String(v).trim() === '';
  });
  if (!missing.length) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }
  banner.hidden = false;
  banner.innerHTML =
    `⚠️ 还有 ${missing.length} 项常用信息未填写（点击可跳转）：` +
    missing.map((k) => `<button type="button" class="miss-item" data-goto="${k.path}">${k.label}</button>`).join(' ');
  banner.querySelectorAll<HTMLButtonElement>('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = document.querySelector(`[data-field="${btn.dataset.goto}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.focus();
      }
    });
  });
}

function collectToState(): void {
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('[data-field]').forEach((el) => {
    const path = el.dataset.field!;
    if (String(getByPath(state, path) ?? '') === el.value) return;
    writeProfileValue(state, path, el.value, 'manual');
  });
  for (const key of Object.keys(LIST_DEFS)) {
    const previous = ((state as unknown as Record<string, Array<Record<string, any>>>)[key] || []);
    const items: Array<Record<string, any>> = [];
    document.querySelectorAll<HTMLElement>(`[data-lpath^="${key}."]`).forEach((el) => {
      const m = (el.dataset.lpath || '').match(/^[^.]+\.(\d+)\.(.+)$/);
      if (!m) return;
      const idx = Number(m[1]);
      items[idx] = items[idx] || {};
      items[idx][m[2]] = (el as HTMLInputElement).value;
    });
    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const old = previous[i] || {};
      const changed = Object.keys(LIST_DEFS[key].cols).some((col) => String(item[col] ?? '') !== String(old[col] ?? ''));
      item.state = changed && canLockProfileRow(item)
        ? { ...(old.state || createRowState('manual', `${key}|${i}|${JSON.stringify(item)}`)), locked: true, source: 'manual', updatedAt: new Date().toISOString(), confidence: 'verified' }
        : old.state;
      if (key === 'essays') item.charLimit = Number(item.charLimit || 0);
    }
    (state as unknown as Record<string, Array<Record<string, any>>>)[key] = items;
  }
}

async function save(): Promise<void> {
  collectToState();
  await saveProfile(state);
  refreshMissingBanner();
  const missing = KEY_FIELDS.filter((k) => {
    const v = getByPath(state, k.path);
    return v == null || String(v).trim() === '';
  }).length;
  showToast(missing ? `✅ 已保存；仍有 ${missing} 项常用信息未填（见顶部提醒）` : '✅ 档案已保存（仅存于本机浏览器）');
}

document.getElementById('saveBtn')!.addEventListener('click', () => {
  save().catch(() => showToast('保存失败，请重试'));
});

document.getElementById('exportBtn')!.addEventListener('click', () => {
  collectToState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tuimian-profile.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('已导出 tuimian-profile.json');
});

document.getElementById('importBtn')!.addEventListener('click', () => {
  (document.getElementById('importFile') as HTMLInputElement).click();
});

document.getElementById('importFile')!.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files && input.files.length ? input.files[0] : null;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      state = normalizeProfile(parsed);
      renderAll();
      save().then(() => showToast('✅ 导入成功并已保存'));
    } catch {
      showToast('❌ 导入失败：JSON 格式不正确');
    }
  };
  reader.readAsText(file);
  (e.target as HTMLInputElement).value = '';
});

document.getElementById('genBtn')!.addEventListener('click', () => {
  if (!window.confirm('将用随机测试数据覆盖当前档案（姓名、学校等为占位内容，身份证号/电话为合法格式的假数据，仅用于验证工具效果）。确定继续吗？')) return;
  state = normalizeProfile(generateTestProfile());
  renderAll();
  save().then(() => showToast('已生成测试数据并保存：请到真实报名页面验证填充效果，确认后再替换为真实信息'));
});

document.getElementById('resetBtn')!.addEventListener('click', () => {
  if (!window.confirm('确定要清空所有档案数据吗？此操作不可恢复。')) return;
  state = emptyProfile();
  renderAll();
  save().then(() => showToast('已清空并保存'));
});

document.getElementById('captchaBtn')!.addEventListener('click', () => {
  // 打开验证码 OCR 设置页（新 tab）
  const url = chrome.runtime.getURL('options/captcha-settings.html');
  window.open(url, '_blank');
});

document.getElementById('confirmMigrationBtn')!.addEventListener('click', () => {
  if (state.pendingClassifications.length) {
    showToast('仍有待分类记录，暂不能确认迁移');
    return;
  }
  state.migration.confirmed = true;
  renderAll();
  void saveProfile(state).then(() => showToast('迁移结果已确认；旧版备份继续保留'));
});

document.querySelectorAll<HTMLButtonElement>('button[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => {
    collectToState();
    const key = btn.dataset.add as string;
    const arr = (state as unknown as Record<string, Array<Record<string, any>>>)[key];
    arr.push({});
    renderList(key, arr);
  });
});

// 商店截图用：?tui-autotest=2 直接加载随机演示档案（不入库），便于对编辑器页面截图
const autotest = /[?&]tui-autotest=2/.test(location.search);
document.querySelectorAll<HTMLButtonElement>('[data-lock-block]').forEach((btn) => {
  btn.addEventListener('click', () => {
    collectToState();
    const key = btn.dataset.lockBlock!;
    const arr = (state as unknown as Record<string, Array<Record<string, any>>>)[key] || [];
    const next = !state.blockLocks[key];
    if (next && !arr.some((row) => canLockProfileRow(row))) {
      showToast('空表、非法日期或占位测试数据不能锁定');
      return;
    }
    state.blockLocks[key] = next;
    for (const row of arr) {
      if (!canLockProfileRow(row)) continue;
      row.state = { ...(row.state || createRowState('manual', `${key}|${JSON.stringify(row)}`)), locked: next, updatedAt: new Date().toISOString() };
    }
    renderAll();
  });
});

const boot = autotest ? Promise.resolve(normalizeProfile(generateTestProfile())) : loadProfile();
boot.then((p) => {
  state = p;
  renderAll();
});

// ===== 网络与规则更新（默认关闭） =====
const remoteEnabled = document.getElementById('remoteEnabled') as HTMLSelectElement;
const remoteUrl = document.getElementById('remoteUrl') as HTMLInputElement;
const syncStatus = document.getElementById('syncRulesStatus') as HTMLElement;

function persistRemoteSettings(): void {
  saveSettings({ remoteRulesEnabled: remoteEnabled.value === '1', remoteRulesUrl: remoteUrl.value.trim() || DEFAULT_RULES_URL }).catch(() => {});
}
loadSettings().then((s) => {
  remoteEnabled.value = s.remoteRulesEnabled ? '1' : '';
  remoteUrl.value = s.remoteRulesUrl;
});
remoteEnabled.addEventListener('change', persistRemoteSettings);
remoteUrl.addEventListener('change', persistRemoteSettings);

document.getElementById('syncRulesBtn')!.addEventListener('click', async () => {
  persistRemoteSettings();
  syncStatus.textContent = '正在下载规则文件…';
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'SYNC_RULES' });
    syncStatus.textContent = resp && resp.ok ? `✅ ${resp.message}` : `❌ ${resp && resp.message ? resp.message : '更新失败'}`;
  } catch {
    syncStatus.textContent = '❌ 更新失败：扩展后台未就绪';
  }
});

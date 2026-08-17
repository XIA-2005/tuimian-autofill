import { emptyProfile, getByPath, normalizeProfile, Profile, setByPath } from '../core/profile';
import { loadProfile, saveProfile } from '../core/storage';
import { generateTestProfile } from '../core/testdata';
import { DEFAULT_RULES_URL, loadSettings, saveSettings } from '../core/rulesync';

interface ListDef {
  cols: Record<string, string>;
  textarea?: string[];
}

const LIST_DEFS: Record<string, ListDef> = {
  awards: { cols: { date: '时间', place: '地点', content: '内容' } },
  research: { cols: { title: '成果名称', type: '类型（论文/项目/竞赛）', date: '时间', role: '本人角色', description: '简要描述' }, textarea: ['description'] },
  experiences: { cols: { start: '起始时间', end: '结束时间', org: '学校或工作单位', role: '担任职务' } },
  socialPractice: { cols: { date: '时间', name: '活动名称', role: '担任职务', detail: '具体内容' }, textarea: ['detail'] },
  familyMembers: { cols: { name: '姓名', relation: '与本人关系', org: '工作单位及职务', phone: '联系电话', politicalStatus: '政治面貌' } },
  selfStatements: { cols: { title: '版本标题', content: '内容' }, textarea: ['content'] },
  applications: { cols: { school: '学校', college: '申请学院', major: '专业/方向', direction: '研究方向', degreeType: '学位类型', supervisor: '意向导师', note: '备注' }, textarea: ['note'] },
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

function renderList(key: string, items: Record<string, string>[]): void {
  const container = document.getElementById('list-' + key) as HTMLElement;
  container.innerHTML = '';
  const def = LIST_DEFS[key];
  items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'row';
    for (const [col, label] of Object.entries(def.cols)) {
      const isArea = def.textarea ? def.textarea.includes(col) : false;
      const field = document.createElement('label');
      field.className = 'col';
      field.textContent = label;
      const ctrl = document.createElement(isArea ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement;
      ctrl.dataset.lpath = `${key}.${i}.${col}`;
      ctrl.value = item[col] || '';
      if (isArea) (ctrl as HTMLTextAreaElement).rows = 4;
      if (!isArea) ctrl.placeholder = label;
      field.appendChild(ctrl);
      row.appendChild(field);
    }
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'row-del';
    del.textContent = '删除';
    del.addEventListener('click', () => {
      collectToState();
      const arr = (state as unknown as Record<string, Record<string, string>[]>)[key];
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
    renderList(key, (state as unknown as Record<string, Record<string, string>[]>)[key] || []);
  }
  refreshMissingBanner();
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
    setByPath(state, el.dataset.field!, el.value);
  });
  for (const key of Object.keys(LIST_DEFS)) {
    const items: Record<string, string>[] = [];
    document.querySelectorAll<HTMLElement>(`[data-lpath^="${key}."]`).forEach((el) => {
      const m = (el.dataset.lpath || '').match(/^[^.]+\.(\d+)\.(.+)$/);
      if (!m) return;
      const idx = Number(m[1]);
      items[idx] = items[idx] || {};
      items[idx][m[2]] = (el as HTMLInputElement).value;
    });
    (state as unknown as Record<string, Record<string, string>[]>)[key] = items;
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
  state = generateTestProfile();
  renderAll();
  save().then(() => showToast('已生成测试数据并保存：请到真实报名页面验证填充效果，确认后再替换为真实信息'));
});

document.getElementById('resetBtn')!.addEventListener('click', () => {
  if (!window.confirm('确定要清空所有档案数据吗？此操作不可恢复。')) return;
  state = emptyProfile();
  renderAll();
  save().then(() => showToast('已清空并保存'));
});

document.querySelectorAll<HTMLButtonElement>('button[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => {
    collectToState();
    const key = btn.dataset.add as string;
    const arr = (state as unknown as Record<string, Record<string, string>[]>)[key];
    arr.push({});
    renderList(key, arr);
  });
});

// 商店截图用：?tui-autotest=2 直接加载随机演示档案（不入库），便于对编辑器页面截图
const autotest = /[?&]tui-autotest=2/.test(location.search);
const boot = autotest ? Promise.resolve(generateTestProfile()) : loadProfile();
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

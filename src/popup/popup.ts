import { getByPath } from '../core/profile';
import { loadProfile } from '../core/storage';

const statusEl = document.getElementById('status') as HTMLElement;
const statEl = document.getElementById('profileStat') as HTMLElement;

function setStatus(text: string, kind: 'info' | 'ok' | 'err' = 'info'): void {
  statusEl.textContent = text;
  statusEl.className = 'status ' + kind;
}

document.getElementById('fillBtn')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) {
    setStatus('未找到当前标签页', 'err');
    return;
  }
  setStatus('正在填充…', 'info');
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'FILL_REQUEST', tabId: tab.id });
    if (!resp || !resp.ok) {
      setStatus('此页面无法填充：浏览器内置页面（edge:// 等）不支持，或页面尚未加载完成。', 'err');
      return;
    }
    const s = resp.stats;
    setStatus(
      `完成 ✅\n识别 ${s.total} 个字段，填充 ${s.filled}，跳过 ${s.skipped}（验证码/密码），档案未填 ${s.profileEmpty}，未匹配 ${s.noMatch}，需人工 ${s.failed + s.picker}（其中弹窗选择框 ${s.picker} 个，请人工核对红色高亮项）。\n绿色=已填，红色=需人工，黄色=档案未填。`,
      'ok',
    );
  } catch {
    setStatus('扩展后台未就绪：请刷新页面后重试', 'err');
  }
});

document.getElementById('panelBtn')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return;
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_PANEL' }, { frameId: 0 });
    if (r && r.ok) setStatus('已显示悬浮面板，请在页面右侧操作', 'ok');
    else setStatus('此页面无法显示面板', 'err');
  } catch {
    setStatus('此页面无法显示面板（如：浏览器内置页面）', 'err');
  }
});

document.getElementById('optionsBtn')!.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

loadProfile().then((p) => {
  const keys = ['basic.name', 'basic.gender', 'basic.idCard', 'basic.phone', 'basic.email', 'education.university', 'education.major', 'education.studentId'];
  const done = keys.filter((k) => {
    const v = getByPath(p, k);
    return v != null && String(v).trim() !== '';
  }).length;
  statEl.textContent = `档案完成度：${done}/${keys.length} 项关键信息`;
});

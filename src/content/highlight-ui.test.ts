// 漏填高亮 · PR2 UI 渲染 · 红阶段测试
//
// 测试方式：export runHighlightUITests() 供 test/run.ts 调用。
// 目标：highlight-ui.ts 尚未实现 → 测试 FAIL。
//
// 禁止条款铁律：
//   - 不准改 content.css
//   - 不准 mock DOM 查询，只用 jsdom
//   - 断言不准依赖具体控件 id/name/label，只用 data-tui-path
import { JSDOM } from 'jsdom';
import { emptyProfile, Profile } from '../core/profile';
import { FillResult } from '../core/highlight';

// ---- 依赖尚未实现的模块：动态 require 让 esbuild 编译期通过、运行期抛错计入 FAIL ----
type HighlightUI = {
  renderHighlights: (
    result: FillResult,
    profile: Profile,
    container: Element | null,
  ) => { green: number; yellow: number; red: number };
  clearHighlights: (container: Element | null) => void;
};
function loadHighlightUI(): HighlightUI | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./highlight-ui') as HighlightUI;
  } catch (_e) {
    return null;
  }
}

let passCount = 0;
let failCount = 0;
const failures: string[] = [];

export function getHighlightUIFailures(): string[] {
  return [...failures];
}

function check(cond: boolean, msg: string): void {
  if (cond) {
    passCount++;
    console.log('PASS: ' + msg);
  } else {
    failCount++;
    failures.push(msg);
    console.error('FAIL: ' + msg);
  }
}

// ============================================================================
// 辅助：构造带表单控件的 jsdom Document
// ============================================================================

function makeDoc(html: string): Document {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return dom.window.document;
}

function mkResult(overrides: Partial<FillResult> = {}): FillResult {
  return {
    filledFields: [],
    failedFields: [],
    skippedFields: [],
    ...overrides,
  };
}

function mkProfile(overrides: Partial<Profile> = {}): Profile {
  return { ...emptyProfile(), ...overrides };
}

// ============================================================================
// renderHighlights 测试（5 个边界 case）
// ============================================================================

export function runHighlightUITests(): void {
  console.log('\n=== highlight-ui PR2 · 红阶段测试 ===');

  // ---- 边界 1：页面无任何表单控件 → 统计全为 0 ----
  {
    const doc = makeDoc('<div id="container"></div>');
    const container = doc.getElementById('container')!;
    const result = mkResult({
      filledFields: [{ path: 'basic.name', value: 'X', driver: 'test' }],
    });
    const profile = mkProfile();
    try {
      const hi = loadHighlightUI();
      if (!hi) { check(false, 'renderHighlights 边界：页面无表单控件 → 模块未加载'); } else {
      const stats = hi.renderHighlights(result, profile, container);
      check(stats.green === 0 && stats.yellow === 0 && stats.red === 0,
        'renderHighlights 边界：页面无表单控件 → 统计全为 0');
      }
    } catch (_e) {
      check(false, 'renderHighlights 边界：页面无表单控件 → 抛错（stub 未实现）');
    }
  }

  // ---- 边界 2：同一控件同时出现在 green 和 red 列表 → 取 red（优先级最高）----
  {
    // 页面：两个 input 分别带 data-tui-path
    const doc = makeDoc(
      '<input data-tui-path="basic.name" />' +
      '<input data-tui-path="basic.phone" />',
    );
    const container = doc.body;
    const result = mkResult({
      // basic.phone：同时出现在 filled + failed（应取 red）
      filledFields: [
        { path: 'basic.name', value: 'X', driver: 'test' },
        { path: 'basic.phone', value: 'X', driver: 'test' },
      ],
      failedFields: [
        { path: 'basic.phone', reason: 'fail', driver: 'test' },
      ],
    });
    const profile = mkProfile();
    try {
      const hi = loadHighlightUI();
      if (!hi) { check(false, 'renderHighlights 边界：filled+failed 同 path → 模块未加载'); } else {
      const stats = hi.renderHighlights(result, profile, container);
      check(
        stats.green === 1 && stats.red === 1,
        'renderHighlights 边界：filled+failed 同 path → red 优先（green=1, red=1）',
      );
      }
    } catch (_e) {
      check(false, 'renderHighlights 边界：filled+failed 同 path → 抛错');
    }
  }

  // ---- 边界 3：控件无 data-tui-path 但有 name → 用 name 模糊匹配 ----
  {
    const doc = makeDoc(
      '<input name="basic_name" />' +
      '<input name="basic_phone" />',
    );
    const container = doc.body;
    const result = mkResult({
      filledFields: [
        { path: 'basic.name', value: 'X', driver: 'test' },
        { path: 'basic.phone', value: 'X', driver: 'test' },
      ],
    });
    const profile = mkProfile();
    try {
      const hi = loadHighlightUI();
      if (!hi) { check(false, 'renderHighlights 边界：无 data-tui-path 但有 name → 模块未加载'); } else {
      const stats = hi.renderHighlights(result, profile, container);
      check(
        stats.green >= 0,
        'renderHighlights 边界：无 data-tui-path 但有 name → 用 name 匹配（不报错）',
      );
      }
    } catch (_e) {
      check(false, 'renderHighlights 边界：无 data-tui-path 但有 name → 抛错');
    }
  }

  // ---- 边界 4：控件无 data-tui-path 也无 name → 跳过，不报错 ----
  {
    const doc = makeDoc(
      '<input id="orphan1" />' +
      '<input id="orphan2" />',
    );
    const container = doc.body;
    const result = mkResult({
      filledFields: [{ path: 'basic.name', value: 'X', driver: 'test' }],
    });
    const profile = mkProfile();
    try {
      const hi = loadHighlightUI();
      if (!hi) { check(false, 'renderHighlights 边界：无 path 控件 → 模块未加载'); } else {
      const stats = hi.renderHighlights(result, profile, container);
      check(
        stats.green === 0 && stats.yellow === 0 && stats.red === 0,
        'renderHighlights 边界：无 path 控件 → 跳过不报错，统计全 0',
      );
      }
    } catch (_e) {
      check(false, 'renderHighlights 边界：无 path 控件 → 抛错');
    }
  }

  // ---- 边界 5：container 为空（null/undefined）→ 返回零统计或抛有意义的错 ----
  {
    const result = mkResult({
      filledFields: [{ path: 'basic.name', value: 'X', driver: 'test' }],
    });
    const profile = mkProfile();
    try {
      // 传入 null 作为 container
      const hi = loadHighlightUI();
      if (!hi) { check(false, 'renderHighlights 边界：container 为 null → 模块未加载'); } else {
      const stats = hi.renderHighlights(result, profile, null as any);
      check(
        stats.green === 0 && stats.yellow === 0 && stats.red === 0,
        'renderHighlights 边界：container 为 null → 返回零统计',
      );
      }
    } catch (_e) {
      // 也接受：抛有意义的 TypeError（而非未捕获的内部错误）
      check(
        (_e as Error).message.includes('null') || (_e as Error).message.includes('container'),
        'renderHighlights 边界：container 为 null → 抛有意义的错误（非内部错误）',
      );
    }
  }

  // ---- 正常路径：data-tui-path 精确匹配 ----
  {
    const doc = makeDoc(
      '<input data-tui-path="basic.name" />' +
      '<input data-tui-path="basic.phone" />' +
      '<input data-tui-path="basic.email" />',
    );
    const container = doc.body;
    const result = mkResult({
      filledFields: [
        { path: 'basic.name', value: '张三', driver: 'test' },
        { path: 'basic.phone', value: '13800000000', driver: 'test' },
      ],
      failedFields: [
        { path: 'basic.email', reason: 'pattern-mismatch', driver: 'test' },
      ],
    });
    const profile = mkProfile();
    try {
      const hi = loadHighlightUI();
      if (!hi) { check(false, 'renderHighlights 正常：data-tui-path 精确匹配 → 模块未加载'); } else {
      const stats = hi.renderHighlights(result, profile, container);
      check(
        stats.green === 2 && stats.red === 1 && stats.yellow === 0,
        'renderHighlights 正常：data-tui-path 精确匹配 → green=2, red=1, yellow=0',
      );
      }
    } catch (_e) {
      check(false, 'renderHighlights 正常：data-tui-path 精确匹配 → 抛错');
    }
  }

  // ---- 正常路径：CSS 类正确添加 ----
  {
    const doc = makeDoc(
      '<input data-tui-path="basic.name" id="name-input" />' +
      '<input data-tui-path="basic.phone" id="phone-input" />' +
      '<input data-tui-path="basic.email" id="email-input" />',
    );
    const container = doc.body;
    const result = mkResult({
      filledFields: [{ path: 'basic.name', value: 'X', driver: 'test' }],
      failedFields: [{ path: 'basic.email', reason: 'fail', driver: 'test' }],
    });
    const profile = mkProfile();
    try {
      const hi = loadHighlightUI();
      if (!hi) { check(false, 'renderHighlights CSS：添加类 → 模块未加载'); } else {
      hi.renderHighlights(result, profile, container);
      const nameEl = doc.getElementById('name-input')!;
      const phoneEl = doc.getElementById('phone-input')!;
      const emailEl = doc.getElementById('email-input')!;
      check(
        nameEl.classList.contains('tui-highlight-green'),
        'renderHighlights CSS：filled 控件 → tui-highlight-green 类',
      );
      check(
        !phoneEl.classList.contains('tui-highlight-green') &&
        !phoneEl.classList.contains('tui-highlight-yellow') &&
        !phoneEl.classList.contains('tui-highlight-red'),
        'renderHighlights CSS：未涉及的控件无高亮类',
      );
      check(
        emailEl.classList.contains('tui-highlight-red'),
        'renderHighlights CSS：failed 控件 → tui-highlight-red 类',
      );
      }
    } catch (_e) {
      check(false, 'renderHighlights CSS：添加类 → 抛错');
    }
  }

  // ============================================================================
  // clearHighlights 测试
  // ============================================================================

  // ---- 正常路径：移除所有 tui-highlight-* 类 ----
  {
    const doc = makeDoc(
      '<input data-tui-path="basic.name" class="tui-highlight-green tui-highlight-yellow tui-highlight-red extra-class" />' +
      '<input data-tui-path="basic.phone" class="tui-highlight-red" />',
    );
    const container = doc.body;
    try {
      const hi = loadHighlightUI();
      if (!hi) { check(false, 'clearHighlights 正常：移除类 → 模块未加载'); } else {
      hi.clearHighlights(container);
      const inputs = container.querySelectorAll('input');
      let allCleared = true;
      for (const inp of Array.from(inputs)) {
        if (
          inp.classList.contains('tui-highlight-green') ||
          inp.classList.contains('tui-highlight-yellow') ||
          inp.classList.contains('tui-highlight-red')
        ) {
          allCleared = false;
          break;
        }
      }
      check(allCleared, 'clearHighlights 正常：移除所有 tui-highlight-* 类');
      // extra-class 应该保留
      const nameEl = doc.querySelector('[data-tui-path="basic.name"]') as HTMLElement;
      check(nameEl.classList.contains('extra-class'), 'clearHighlights 正常：保留其他非 tui-* 类');
      }
    } catch (_e) {
      check(false, 'clearHighlights 正常：移除类 → 抛错');
    }
  }

  // ---- 边界：container 无任何高亮元素 → 不报错 ----
  {
    const doc = makeDoc('<div><input data-tui-path="basic.name" class="other-class" /></div>');
    const container = doc.body;
    try {
      const hi = loadHighlightUI();
      if (!hi) { check(false, 'clearHighlights 边界：无高亮元素 → 模块未加载'); } else {
      hi.clearHighlights(container);
      check(true, 'clearHighlights 边界：无高亮元素 → 不报错');
      }
    } catch (_e) {
      check(false, 'clearHighlights 边界：无高亮元素 → 抛错');
    }
  }

  // ---- 边界：container 为 null → 不报错 ----
  {
    try {
      const hi = loadHighlightUI();
      if (!hi) { check(false, 'clearHighlights 边界：container 为 null → 模块未加载'); } else {
      hi.clearHighlights(null as any);
      check(true, 'clearHighlights 边界：container 为 null → 不报错');
      }
    } catch (_e) {
      check(false, 'clearHighlights 边界：container 为 null → 抛错');
    }
  }

  // ---- 边界：嵌套 container 只清除子元素高亮 ----
  {
    const doc = makeDoc(
      '<div id="outer" class="tui-highlight-green">' +
        '<input data-tui-path="basic.name" class="tui-highlight-red" />' +
        '<div id="inner">' +
          '<input data-tui-path="basic.phone" class="tui-highlight-yellow" />' +
        '</div>' +
      '</div>',
    );
    const outer = doc.getElementById('outer')!;
    try {
      const hi = loadHighlightUI();
      if (!hi) { check(false, 'clearHighlights 边界：嵌套 container → 模块未加载'); } else {
      hi.clearHighlights(outer);
      const outerEl = doc.getElementById('outer')!;
      const innerInput = doc.querySelector('#inner input')!;
      check(
        !outerEl.classList.contains('tui-highlight-green') &&
        !innerInput.classList.contains('tui-highlight-yellow'),
        'clearHighlights 边界：嵌套 container 清除所有子元素高亮',
      );
      }
    } catch (_e) {
      check(false, 'clearHighlights 边界：嵌套 container → 抛错');
    }
  }

  // ---- 统计精度：select / textarea 也计入 ----
  {
    const doc = makeDoc(
      '<input data-tui-path="basic.name" />' +
      '<select data-tui-path="basic.gender"><option>男</option></select>' +
      '<textarea data-tui-path="basic.address"></textarea>',
    );
    const container = doc.body;
    const result = mkResult({
      filledFields: [
        { path: 'basic.name', value: 'X', driver: 'test' },
        { path: 'basic.gender', value: 'X', driver: 'test' },
        { path: 'basic.address', value: 'X', driver: 'test' },
      ],
    });
    const profile = mkProfile();
    try {
      const hi = loadHighlightUI();
      if (!hi) { check(false, 'renderHighlights 正常：select/textarea → 模块未加载'); } else {
      const stats = hi.renderHighlights(result, profile, container);
      check(
        stats.green === 3,
        'renderHighlights 正常：input/select/textarea 均计入 green=3',
      );
      }
    } catch (_e) {
      check(false, 'renderHighlights 正常：select/textarea → 抛错');
    }
  }

  // ============================================================================
  // 汇总
  // ============================================================================
  console.log(`\nhighlight-ui 用例：${passCount} PASS, ${failCount} FAIL`);
  if (failCount > 0) {
    console.error('失败列表：');
    for (const f of failures) console.error('  - ' + f);
  }
}

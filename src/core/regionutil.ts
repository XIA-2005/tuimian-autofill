// 行政区划数据驱动的地区解析/关键字工具（配合 regions.ts 全国省市区县数据与 region_codes.ts 6 位区划码）
import { REGION_TREE } from './regions';
import { REGION_CODES } from './region_codes';

/** 去掉"省/市/区/县/州/盟/旗/地区"等后缀便于比较 */
function stripSuffix(s: string): string {
  return (s || '').replace(/(特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|省|市|区|县|州|盟|旗|地区)$/g, '');
}

export interface RegionParts {
  province: string;
  city: string;
  district: string;
}

/**
 * 把"陕西省西安市未央区"这类值按数据拆成 省/市/区（省名最长前缀匹配）。
 * 兼容"陕西西安未央区"（不带后缀）与直辖市"北京市海淀区"（市=市辖区、区=剩余部分）。
 */
export function splitRegion(value: string): RegionParts | null {
  const v = (value || '').trim();
  if (v.length < 4) return null;
  let best: RegionParts | null = null;
  for (const p of Object.keys(REGION_TREE)) {
    const pn = stripSuffix(p);
    const idx = v.startsWith(p) ? p.length : v.startsWith(pn) ? pn.length : -1;
    if (idx < 0) continue;
    if (best && best.province.length >= p.length) continue; // 已命中更长的省名
    const rest = v.slice(idx);
    let city = '';
    let district = '';
    for (const c of Object.keys(REGION_TREE[p])) {
      const cn = stripSuffix(c);
      const j = rest.startsWith(c) ? c.length : rest.startsWith(cn) ? cn.length : -1;
      if (j >= 0) {
        city = c;
        district = rest.slice(j).trim();
        break;
      }
    }
    if (!city) {
      // 直辖市写法"北京市海淀区"：数据里市=市辖区/县，地址省略了它 → 用剩余部分当区
      const mu = Object.keys(REGION_TREE[p]).find((c) => c === '市辖区' || c === '县');
      if (mu && rest) {
        city = mu;
        district = rest;
      }
    }
    if (!city) continue;
    if (!best || p.length > best.province.length || city.length > best.city.length) {
      best = { province: p, city, district };
    }
  }
  return best;
}

/** 地区类值是否可按数据解析出 省+市 两级 */
export function isRegionLike(value: string): boolean {
  const r = splitRegion(value);
  return !!r && !!r.province && !!r.city;
}

/** 地区值的 6 位行政区划代码（区县级叶子码；如"陕西省西安市未央区"→"610112"）。查不到返回 null */
export function regionCode6(value: string): string | null {
  const r = splitRegion(value);
  if (!r) return null;
  return REGION_CODES[`${r.province}|${r.city}|${r.district}`] || null;
}

/** 6 位区划码 → "陕西省西安市未央区"（反查区县叶子条目；如 610102 → 陕西省西安市新城区） */
export function regionNameFromCode(code6: string): string | null {
  const c = String(code6 || '').trim();
  if (!/^\d{6}$/.test(c)) return null;
  for (const [key, code] of Object.entries(REGION_CODES)) {
    if (code === c) {
      const parts = key.split('|');
      if (parts.length === 3 && parts[2] && parts[2] !== '其他' && parts[2] !== '其它') return parts.join('');
    }
  }
  return null;
}

/** 身份证前 6 位 → 地区名（出生地/籍贯/户口地缺省推导，成熟填表软件同款做法；查不到返回 null） */
export function regionFromIdCard(profile: { basic: { idCard?: string } }): string | null {
  try {
    const id = ((profile.basic && profile.basic.idCard) || '').trim();
    const m = /^(\d{6})/.exec(id);
    return m ? regionNameFromCode(m[1]) : null;
  } catch {
    return null;
  }
}

/** 查询窗口关键字阶梯（保留"市/区"后缀更精确；直辖市用区名直查）；最多 3 个，控制总时长 */
export function regionKeywords(value: string): string[] {
  const r = splitRegion(value);
  const out: string[] = [];
  const push = (s: string) => {
    const t = (s || '').trim();
    if (t.length >= 2 && out.indexOf(t) < 0) out.push(t);
  };
  if (!r) {
    push(value.trim());
    return out;
  }
  const cityRaw = r.city.trim();
  const districtRaw = r.district.trim();
  if (/^市辖/.test(cityRaw)) {
    push(districtRaw);
    push(r.province);
  } else {
    push(cityRaw);
    push(districtRaw);
    push(cityRaw + districtRaw);
  }
  return out;
}

/** 结果行匹配用 token（保留后缀的 市/区 名） */
export function regionMatchTokens(value: string): string[] {
  const r = splitRegion(value);
  const out: string[] = [];
  const push = (s: string) => {
    const t = (s || '').trim();
    if (t.length >= 2 && out.indexOf(t) < 0) out.push(t);
  };
  if (!r) return out;
  const cityRaw = r.city.trim();
  const districtRaw = r.district.trim();
  if (/^市辖/.test(cityRaw)) {
    push(districtRaw);
    push(stripSuffix(r.province));
  } else {
    push(cityRaw);
    push(districtRaw);
    push(cityRaw + districtRaw);
  }
  return out;
}

/** 树形点选用 tokens：省 → 市 → 区（区为空则两级） */
export function regionTreeTokens(value: string): string[] {
  const r = splitRegion(value);
  if (!r) return [];
  return [r.province, r.city, r.district].map((t) => (t || '').trim()).filter((t) => t.length >= 2);
}

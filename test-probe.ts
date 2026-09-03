// 探针脚本：确认 captcha 检测器在 jsdom 下的真实行为
import { JSDOM } from 'jsdom';

const dom = new JSDOM(`<html><body>
  <input type="text" name="yzm" maxlength="4" placeholder="验证码">
  <img src="/cap.png" width="80" height="30">
</body></html>`, { url: 'http://example.edu.cn/' });
const w = dom.window as any;
const doc = w.document;
const input = doc.querySelector('input') as any;
const img = doc.querySelector('img') as any;
console.log('input.offsetParent:', input.offsetParent);
console.log('input.offsetWidth:', input.offsetWidth);
console.log('input.parentElement.children:', input.parentElement.children.length);
console.log('img.naturalWidth:', img.naturalWidth, 'naturalHeight:', img.naturalHeight);
console.log('parent children:', Array.from(input.parentElement.children).map((c: any) => c.tagName).join(','));
console.log('input.getAttribute("maxlength"):', input.getAttribute('maxlength'));

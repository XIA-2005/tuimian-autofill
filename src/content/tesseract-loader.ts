// tesseract.js CDN 加载器：作为独立 content script 在每个页面上运行（loadAt=document_idle）
// 功能：在 content.ts 调用 OCR 前确保 tesseract.js 已加载到全局 window
// 不打入主 bundle，每次使用按需 CDN 懒加载
//
// 协议：
//  - tesseract.js UMD 挂载 window.Tesseract
//  - 我们监听 window 的 'tesseract-ready' 自定义事件
//  - content.ts 监听该事件，等待 ready 后再调用 recognize()

(function () {
  'use strict';

  // 避免重复注入
  if ((window as any).__tuiTesseractInjected) return;
  (window as any).__tuiTesseractInjected = true;

  function announceReady(Tesseract: any): void {
    (window as any).Tesseract = Tesseract;
    window.dispatchEvent(new CustomEvent('tesseract-ready', { detail: { Tesseract } }));
  }

  // 已经存在（其他扩展/页面试图已加载）
  if ((window as any).Tesseract) {
    announceReady((window as any).Tesseract);
    return;
  }

  // 注入 CDN 脚本（用 web_accessible_resources 已暴露 tesseract.min.js）
  const url = (chrome as any).runtime.getURL('vendor/tesseract.min.js');
  const script = document.createElement('script');
  script.src = url;
  script.async = false; // 必须等它加载完才能用
  script.onload = (): void => {
    if ((window as any).Tesseract) {
      announceReady((window as any).Tesseract);
    } else {
      console.error('[tui-tesseract] CDN 脚本加载完成但 window.Tesseract 未定义');
    }
  };
  script.onerror = (e: any): void => {
    console.error('[tui-tesseract] 加载失败：', e);
  };
  (document.head || document.documentElement).appendChild(script);
})();

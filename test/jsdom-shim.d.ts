// jsdom 类型垫片：仅测试用。
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    window: any;
  }
}

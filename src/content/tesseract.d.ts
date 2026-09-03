// 第三方库 tesseract.js 懒加载（在浏览器中通过 dynamic import 加载，~10MB WASM）
// 此处仅声明类型；运行时实际模块由 dynamic import 加载，不进入主 bundle

declare module 'tesseract.js' {
  export interface RecognizeResult {
    data: {
      text: string;
      confidence: number;
      words?: Array<{ text: string; confidence: number }>;
    };
  }
  export function recognize(
    image: HTMLCanvasElement | HTMLImageElement | string,
    lang?: string,
    options?: {
      logger?: (m: { status: string; progress: number }) => void;
    },
  ): Promise<RecognizeResult>;
}

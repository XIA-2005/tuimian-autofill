// Captcha 模块共享类型

export type CaptchaRoute = 'A' | 'B';

export interface CaptchaSettings {
  enabled: boolean;
  route: CaptchaRoute;
  autoTrigger: boolean;
  previewDuration: number;
  routeBEndpoint: string;
  routeBToken: string;
  confidenceThreshold: number;
}

export interface OcrResult {
  text: string;
  confidence: number; // 0-1
  source: CaptchaRoute;
}

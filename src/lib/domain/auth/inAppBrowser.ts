/**
 * In-app browsers (Messenger, Instagram, …) block Google sign-in with
 * "disallowed_useragent", so the UI shows an "open in your browser" guide instead (AUTH-15).
 */
export type InAppBrowser =
  | 'facebook'
  | 'instagram'
  | 'line'
  | 'wechat'
  | 'tiktok'
  | 'snapchat'
  | 'linkedin'
  | 'android-webview';

const PATTERNS: [RegExp, InAppBrowser][] = [
  [/FBAN|FBAV|FB_IAB|FBIOS|MessengerForiOS|Messenger/i, 'facebook'],
  [/Instagram/i, 'instagram'],
  [/\bLine\//, 'line'],
  [/MicroMessenger/i, 'wechat'],
  [/BytedanceWebview|musical_ly|TikTok/i, 'tiktok'],
  [/Snapchat/i, 'snapchat'],
  [/LinkedInApp/i, 'linkedin'],
  // Generic Android WebView: "...; wv) AppleWebKit/..."
  [/;\s*wv\)/, 'android-webview'],
];

export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  for (const [pattern, app] of PATTERNS) {
    if (pattern.test(userAgent)) return app;
  }
  return null;
}

/** iPhone and iPad (including iPadOS, which reports itself as a Mac with touch). */
export function isAppleMobile(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

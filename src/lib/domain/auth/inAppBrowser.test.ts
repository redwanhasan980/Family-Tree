import { describe, expect, it } from 'vitest';

import { detectInAppBrowser, isAppleMobile } from './inAppBrowser';

const UA = {
  messengerAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/480.0.0.0;]',
  facebookIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0;FBBV/1]',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 13; SM-A145F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0 Mobile Safari/537.36',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};

describe('detectInAppBrowser', () => {
  it.each([
    ['messengerAndroid', 'facebook'],
    ['facebookIos', 'facebook'],
    ['instagram', 'instagram'],
    ['androidWebView', 'android-webview'],
  ] as const)('detects %s', (name, app) => {
    expect(detectInAppBrowser(UA[name])).toBe(app);
  });

  it.each(['chromeAndroid', 'safariIphone', 'desktopChrome'] as const)(
    'leaves %s alone',
    (name) => {
      expect(detectInAppBrowser(UA[name])).toBeNull();
    },
  );
});

describe('isAppleMobile', () => {
  it('recognises iPhones and iPads in desktop mode', () => {
    expect(isAppleMobile(UA.safariIphone)).toBe(true);
    expect(isAppleMobile(UA.ipadDesktopMode, 5)).toBe(true);
    expect(isAppleMobile(UA.ipadDesktopMode, 0)).toBe(false);
    expect(isAppleMobile(UA.chromeAndroid)).toBe(false);
  });
});

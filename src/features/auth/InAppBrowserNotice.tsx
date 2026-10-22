'use client';

import { CopyIcon, ExternalLinkIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { isAppleMobile } from '@/lib/domain/auth/inAppBrowser';

/** Shown instead of the Google button inside in-app browsers (AUTH-15). */
export function InAppBrowserNotice() {
  const t = useTranslations('inAppBrowser');
  const apple =
    typeof navigator !== 'undefined' &&
    isAppleMobile(navigator.userAgent, navigator.maxTouchPoints);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('copied'));
    } catch {
      window.prompt(t('copyLink'), window.location.href);
    }
  };

  return (
    <div
      className="space-y-2 rounded-xl bg-surface-muted p-4 text-sm"
      data-testid="in-app-browser-notice"
    >
      <p className="flex items-center gap-2 font-semibold">
        <ExternalLinkIcon className="size-4" aria-hidden /> {t('title')}
      </p>
      <p className="text-muted-foreground">{t('body')}</p>
      <p>{apple ? t('stepsIos') : t('stepsAndroid')}</p>
      <Button type="button" variant="outline" className="w-full" onClick={() => void copy()}>
        <CopyIcon aria-hidden /> {t('copyLink')}
      </Button>
    </div>
  );
}

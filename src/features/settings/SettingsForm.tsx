'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { LanguageSwitch } from '@/components/app/LanguageSwitch';
import { Button } from '@/components/ui/button';
import { FormField } from '@/features/auth/FormField';
import { useSession } from '@/features/auth/SessionProvider';
import { useAuthErrorText, useValidationText } from '@/features/auth/useMessages';
import { Link } from '@/i18n/navigation';
import { ProfileSettingsSchema } from '@/lib/domain/auth/forms';
import type { ThemePreference } from '@/lib/domain/types';
import { updateDisplayName } from '@/lib/repositories/auth';

import type { ReactNode } from 'react';
import type { z } from 'zod';

const NameSchema = ProfileSettingsSchema.pick({ displayName: true });
type NameInput = z.infer<typeof NameSchema>;

const THEMES = [
  { value: 'light', icon: SunIcon, label: 'themeLight' },
  { value: 'dark', icon: MoonIcon, label: 'themeDark' },
  { value: 'system', icon: MonitorIcon, label: 'themeSystem' },
] as const satisfies readonly { value: ThemePreference; icon: unknown; label: string }[];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Name, language and theme (AUTH-11, I18N-01). Language and theme apply at once. */
export function SettingsForm() {
  const t = useTranslations();
  const { session } = useSession();
  const { theme, setTheme } = useTheme();
  const validation = useValidationText();
  const errorText = useAuthErrorText();
  const registered = session.status === 'registered' ? session.user : null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<NameInput>({
    resolver: zodResolver(NameSchema),
    values: { displayName: registered?.displayName ?? '' },
  });

  // The name lives on the account, so saving needs a connection; the profile copy follows.
  const saveName = handleSubmit(async ({ displayName }) => {
    try {
      await updateDisplayName(displayName);
      reset({ displayName });
      toast.success(t('settings.saved'));
    } catch (error) {
      toast.error(errorText(error));
    }
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-3xl font-bold">{t('settings.title')}</h1>

      <Section title={t('settings.profileSection')}>
        {registered ? (
          <form onSubmit={saveName} noValidate className="space-y-4">
            <FormField
              label={t('settings.displayNameLabel')}
              autoComplete="name"
              error={validation(errors.displayName?.message)}
              {...register('displayName')}
            />
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? t('auth.working') : t('settings.save')}
            </Button>
          </form>
        ) : (
          <p className="text-muted-foreground">{t('settings.guestNameHint')}</p>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">{t('settings.languageLabel')}</p>
          <LanguageSwitch />
        </div>

        <div className="space-y-2">
          <p id="settings-theme" className="text-sm font-medium">
            {t('settings.themeLabel')}
          </p>
          <div role="group" aria-labelledby="settings-theme" className="flex flex-wrap gap-2">
            {THEMES.map(({ value, icon: Icon, label }) => {
              const active = (theme ?? 'system') === value;
              return (
                <Button
                  key={value}
                  type="button"
                  variant={active ? 'default' : 'outline'}
                  aria-pressed={active}
                  onClick={() => setTheme(value)}
                  className="h-11 rounded-full"
                >
                  <Icon aria-hidden /> {t(`common.${label}`)}
                </Button>
              );
            })}
          </div>
        </div>
      </Section>

      <Section title={t('settings.accountSection')}>
        {registered ? (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t('settings.emailLabel')}</p>
            <p className="font-medium break-all">{registered.email}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-muted-foreground">{t('settings.guestAccount')}</p>
            <Button asChild>
              <Link href="/signup">{t('guest.cta')}</Link>
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}

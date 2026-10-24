'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { FormField } from '@/features/auth/FormField';
import { useSession } from '@/features/auth/SessionProvider';
import { useValidationText } from '@/features/auth/useMessages';
import { GenderChoice } from '@/features/person/GenderChoice';
import { startTree } from '@/features/trees/treeActions';
import { useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { hasUser } from '@/lib/domain/auth/session';
import { AncestorFormSchema, ancestorTreeInput, type AncestorForm } from '@/lib/domain/treeForms';
import type { Locale } from '@/lib/domain/types';
import { logger } from '@/lib/logger';
import { completeOnboarding } from '@/lib/repositories/users';

import { markWizardDoneHere, welcomeTo } from './progress';

/** The wizard's steps; the third (children) happens in the editor, with its own dialog. */
const TOTAL = 3;
const LANGUAGE_NAMES: Record<Locale, string> = { bn: 'বাংলা', en: 'English' };

function StepHeader({ current, title, hint }: { current: number; title: string; hint: string }) {
  const t = useTranslations('onboarding');
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-primary">{t('step', { current, total: TOTAL })}</p>
      <h1 className="text-2xl leading-snug font-bold sm:text-3xl">{title}</h1>
      <p className="text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * The first-run wizard (P8-02, ONB-02): ① the language, ② the oldest ancestor
 * remembered, then the tree opens with ③ the "Add children" dialog for them and ④ a few
 * tips. Every step can be skipped. The step is in the URL, so changing the language
 * (a new page) keeps the place.
 */
export function Wizard() {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const params = useSearchParams();
  const { session } = useSession();
  const validation = useValidationText();
  const step = params.get('step') === 'ancestor' ? 'ancestor' : 'language';
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AncestorForm>({
    resolver: zodResolver(AncestorFormSchema),
    defaultValues: { rootName: '' },
  });

  const finish = () => {
    markWizardDoneHere();
    if (!hasUser(session)) return;
    completeOnboarding(session.user.uid, session.status === 'guest').catch((error: unknown) =>
      logger.error('onboarding.complete', error),
    );
  };

  const skip = () => {
    finish();
    router.replace('/trees');
  };

  const onSubmit = handleSubmit((form) => {
    if (!hasUser(session)) return;
    const name = AncestorFormSchema.parse(form).rootName;
    const result = startTree(
      session.user.uid,
      ancestorTreeInput(AncestorFormSchema.parse(form), t('onboarding.treeName', { name })),
      () => toast.error(t('editor.saveFailed')),
    );
    if (!result.ok || !result.treeId) {
      toast.error(t('apiErrors.unknown'));
      return;
    }
    finish();
    welcomeTo(result.treeId);
    router.replace(`/trees/${result.treeId}`);
  });

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-8 px-4 py-10 sm:py-16">
      {step === 'language' ? (
        <>
          <StepHeader
            current={1}
            title={t('onboarding.languageTitle')}
            hint={t('onboarding.languageHint')}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {routing.locales.map((option) => (
              <Button
                key={option}
                lang={option}
                size="lg"
                variant={option === locale ? 'default' : 'outline'}
                className="h-16 text-lg"
                onClick={() => router.replace('/start?step=ancestor', { locale: option })}
              >
                {LANGUAGE_NAMES[option]}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <StepHeader
            current={2}
            title={t('onboarding.ancestorTitle')}
            hint={t('onboarding.ancestorHint')}
          />
          <FormField
            label={t('onboarding.ancestorName')}
            placeholder={t('onboarding.ancestorPlaceholder')}
            hint={t('person.nameHint')}
            autoComplete="off"
            autoFocus
            error={validation(errors.rootName?.message)}
            {...register('rootName')}
          />
          <GenderChoice
            legend={t('person.genderLabel')}
            error={validation(errors.rootGender?.message)}
            {...register('rootGender')}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => router.replace('/start')}
            >
              {t('onboarding.back')}
            </Button>
            <Button type="submit" className="h-11 px-6" disabled={isSubmitting}>
              {t('onboarding.next')}
            </Button>
          </div>
        </form>
      )}
      <Button variant="link" className="h-11 self-center" onClick={skip}>
        {t('onboarding.skip')}
      </Button>
    </div>
  );
}

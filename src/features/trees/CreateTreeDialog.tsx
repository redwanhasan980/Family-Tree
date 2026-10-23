'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormField } from '@/features/auth/FormField';
import { useSession } from '@/features/auth/SessionProvider';
import { useValidationText } from '@/features/auth/useMessages';
import { GenderChoice } from '@/features/person/GenderChoice';
import { useRouter } from '@/i18n/navigation';
import { hasUser } from '@/lib/domain/auth/session';
import { CreateTreeFormSchema, createTreeInput, type CreateTreeForm } from '@/lib/domain/treeForms';

import { startTree } from './treeActions';

const EMPTY: CreateTreeForm = { name: '', rootName: '' };

/** New tree: a name and, optionally, the oldest person the user remembers (TREE-01). */
export function CreateTreeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { session } = useSession();
  const validation = useValidationText();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateTreeForm>({
    resolver: zodResolver(CreateTreeFormSchema),
    defaultValues: EMPTY,
  });
  const hasRoot = Boolean(useWatch({ control, name: 'rootName' })?.trim());

  const close = (next: boolean) => {
    if (!next) reset(EMPTY);
    onOpenChange(next);
  };

  const onSubmit = handleSubmit((form) => {
    if (!hasUser(session)) return;
    const result = startTree(session.user.uid, createTreeInput(form), () =>
      toast.error(t('editor.saveFailed')),
    );
    if (!result.ok || !result.treeId) {
      toast.error(t('apiErrors.unknown'));
      return;
    }
    close(false);
    router.push(`/trees/${result.treeId}`);
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createTree.title')}</DialogTitle>
          <DialogDescription>{t('createTree.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <FormField
            label={t('createTree.nameLabel')}
            placeholder={t('createTree.namePlaceholder')}
            autoComplete="off"
            error={validation(errors.name?.message)}
            {...register('name')}
          />
          <FormField
            label={t('createTree.rootLabel')}
            placeholder={t('createTree.rootPlaceholder')}
            hint={t('createTree.rootHint')}
            autoComplete="off"
            error={validation(errors.rootName?.message)}
            {...register('rootName')}
          />
          {hasRoot && (
            <GenderChoice
              legend={t('person.genderLabel')}
              error={validation(errors.rootGender?.message)}
              {...register('rootGender')}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="h-11" disabled={isSubmitting}>
              {t('createTree.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

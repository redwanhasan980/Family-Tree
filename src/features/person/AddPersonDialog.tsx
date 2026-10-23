'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';

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
import { useValidationText } from '@/features/auth/useMessages';
import { addPerson } from '@/features/editor/commands';
import { useEditor } from '@/features/editor/EditorProvider';
import {
  QuickPersonFormSchema,
  quickPersonInput,
  type QuickPersonForm,
} from '@/lib/domain/personForms';
import type { ID } from '@/lib/domain/types';

import { GenderChoice } from './GenderChoice';

const EMPTY: QuickPersonForm = { name: '', gender: null };

/**
 * Adds one person with just a name and man or woman (PER-01). P3 uses it for the first
 * person of an empty tree; P4 builds the relative forms on it.
 */
export function AddPersonDialog({
  open,
  onOpenChange,
  title,
  description,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onAdded?: (personId: ID) => void;
}) {
  const t = useTranslations();
  const editor = useEditor();
  const validation = useValidationText();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<QuickPersonForm>({
    resolver: zodResolver(QuickPersonFormSchema),
    defaultValues: EMPTY,
  });

  const close = (next: boolean) => {
    if (!next) reset(EMPTY);
    onOpenChange(next);
  };

  const onSubmit = handleSubmit((form) => {
    const result = editor.run((ctx) => addPerson(ctx, quickPersonInput(form)));
    if (!result.ok) {
      setError('name', { message: result.issues[0]?.code ?? 'invalid' });
      return;
    }
    const added = result.command.createdIds?.[0];
    close(false);
    if (added) onAdded?.(added);
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <FormField
            label={t('person.nameLabel')}
            placeholder={t('person.namePlaceholder')}
            hint={t('person.nameHint')}
            autoComplete="off"
            error={validation(errors.name?.message)}
            {...register('name')}
          />
          <GenderChoice
            legend={t('person.genderLabel')}
            error={validation(errors.gender?.message)}
            {...register('gender')}
          />
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="h-11">
              {t('person.add')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

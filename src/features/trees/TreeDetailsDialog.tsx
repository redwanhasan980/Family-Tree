'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/features/auth/FormField';
import { useSession } from '@/features/auth/SessionProvider';
import { useValidationText } from '@/features/auth/useMessages';
import { hasUser } from '@/lib/domain/auth/session';
import { TreeDetailsSchema, type TreeDetailsInput } from '@/lib/domain/schemas';
import type { Tree } from '@/lib/domain/types';

import { saveTreeDetails } from './treeActions';

/** Rename a tree or change its description (TREE-03). */
export function TreeDetailsDialog({
  tree,
  open,
  onOpenChange,
}: {
  tree: Tree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const { session } = useSession();
  const validation = useValidationText();
  const descriptionId = useId();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TreeDetailsInput>({
    resolver: zodResolver(TreeDetailsSchema),
    values: { name: tree.name, description: tree.description ?? '' },
  });

  const onSubmit = handleSubmit((details) => {
    if (!hasUser(session)) return;
    const result = saveTreeDetails(session.user.uid, tree, details, () =>
      toast.error(t('editor.saveFailed')),
    );
    if (result.ok) toast.success(t('treeDetails.saved'));
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('treeDetails.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <FormField
            label={t('createTree.nameLabel')}
            autoComplete="off"
            error={validation(errors.name?.message)}
            {...register('name')}
          />
          <div className="space-y-1.5">
            <Label htmlFor={descriptionId}>{t('treeDetails.descriptionLabel')}</Label>
            <Textarea
              id={descriptionId}
              rows={3}
              placeholder={t('treeDetails.descriptionPlaceholder')}
              aria-invalid={errors.description ? true : undefined}
              className="text-base"
              {...register('description')}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{validation(errors.description.message)}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="h-11">
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

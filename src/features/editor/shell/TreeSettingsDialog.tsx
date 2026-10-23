'use client';

import { PencilIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TreeDetailsDialog } from '@/features/trees/TreeDetailsDialog';
import type { ColorBy, NameDisplay, Tree, TreeSettings, ViewKind } from '@/lib/domain/types';
import { enabledViews } from '@/lib/features';

import { updateTreeDetails, updateTreeSettings } from '../commands';
import { useEditor } from '../EditorProvider';

const NAME_DISPLAYS: readonly NameDisplay[] = ['auto', 'bn', 'en', 'both'];
const COLOR_BYS: readonly ColorBy[] = ['branch', 'gender', 'generation', 'none'];

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <Label htmlFor={htmlFor} className="text-base font-normal">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Choice<T extends string>({
  id,
  value,
  options,
  label,
  onChange,
}: {
  id: string;
  value: T;
  options: readonly T[];
  label: (option: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger id={id} className="h-11 w-full text-base sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option} className="min-h-10">
            {label(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * How the tree is shown (TREE-06). Each change applies at once and can be undone. The
 * kinship style is left out until the relationship finder uses it (R4).
 */
export function TreeSettingsDialog({
  tree,
  open,
  onOpenChange,
}: {
  tree: Tree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const editor = useEditor();
  const id = useId();
  const [renaming, setRenaming] = useState(false);
  const { settings } = tree;
  const change = (patch: Partial<TreeSettings>) =>
    editor.run((ctx) => updateTreeSettings(ctx, patch));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('treeSettings.title')}</DialogTitle>
            <DialogDescription>{t('treeSettings.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <Button
              variant="outline"
              className="h-11 w-full justify-start"
              onClick={() => {
                onOpenChange(false);
                setRenaming(true);
              }}
            >
              <PencilIcon aria-hidden /> {t('trees.details')}
            </Button>
            <Row label={t('treeSettings.nameDisplay')} htmlFor={`${id}-names`}>
              <Choice
                id={`${id}-names`}
                value={settings.nameDisplay}
                options={NAME_DISPLAYS}
                label={(v) => t(`treeSettings.nameDisplayOptions.${v}`)}
                onChange={(nameDisplay) => change({ nameDisplay })}
              />
            </Row>
            <Row label={t('treeSettings.colorBy')} htmlFor={`${id}-color`}>
              <Choice
                id={`${id}-color`}
                value={settings.colorBy}
                options={COLOR_BYS}
                label={(v) => t(`treeSettings.colorByOptions.${v}`)}
                onChange={(colorBy) => change({ colorBy })}
              />
            </Row>
            <Row label={t('treeSettings.defaultView')} htmlFor={`${id}-view`}>
              <Choice<ViewKind>
                id={`${id}-view`}
                value={settings.defaultView}
                options={enabledViews()}
                label={(v) => t(`views.name.${v}`)}
                onChange={(defaultView) => change({ defaultView })}
              />
            </Row>
            <Row label={t('treeSettings.showPhotos')} htmlFor={`${id}-photos`}>
              <Switch
                id={`${id}-photos`}
                checked={settings.showPhotos}
                onCheckedChange={(showPhotos) => change({ showPhotos })}
              />
            </Row>
            <Row label={t('treeSettings.showDates')} htmlFor={`${id}-dates`}>
              <Switch
                id={`${id}-dates`}
                checked={settings.showDates}
                onCheckedChange={(showDates) => change({ showDates })}
              />
            </Row>
          </div>
        </DialogContent>
      </Dialog>
      {renaming && (
        <TreeDetailsDialog
          tree={tree}
          open
          onOpenChange={setRenaming}
          save={(details) => editor.run((ctx) => updateTreeDetails(ctx, details))}
        />
      )}
    </>
  );
}

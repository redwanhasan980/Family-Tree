'use client';

import { PlusIcon, XIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormError } from '@/features/auth/FormField';
import { addChildren } from '@/features/editor/commands';
import { resolveOtherParent } from '@/features/editor/commands/personCommands';
import { useEditor } from '@/features/editor/EditorProvider';
import { useIssueText } from '@/features/editor/useIssueText';
import { displayName, nameFromText } from '@/lib/domain/names';
import { otherParentChoices } from '@/lib/domain/relatives';
import { LIMITS } from '@/lib/domain/schemas';
import type { ID, Locale } from '@/lib/domain/types';
import { cn } from '@/lib/utils';
import { selectGraph, useTree } from '@/stores/treeStore';

import { FORM_DIALOG } from './AddRelativeDialog';

/** REL-04: up to 50 at once. */
const MAX_ROWS = 50;

interface Row {
  key: number;
  name: string;
  gender: 'male' | 'female';
}

let rowKey = 0;
const newRow = (name = ''): Row => ({ key: ++rowKey, name, gender: 'male' });

/** The son/daughter toggle of one row. */
function SonOrDaughter({
  row,
  number,
  className,
  onChange,
}: {
  row: Row;
  number: number;
  className?: string;
  onChange: (gender: Row['gender']) => void;
}) {
  const t = useTranslations('relatives');
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={t('childRole', { number })}
      className={cn('grid shrink-0 grid-cols-2 overflow-hidden rounded-md border', className)}
    >
      {(['male', 'female'] as const).map((gender) => (
        <label
          key={gender}
          className="flex h-11 min-w-16 cursor-pointer items-center justify-center px-2 text-sm font-medium transition-colors hover:bg-accent has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50 has-focus-visible:ring-inset"
        >
          <input
            type="radio"
            name={name}
            value={gender}
            checked={row.gender === gender}
            onChange={() => onChange(gender)}
            className="sr-only"
          />
          {t('roles.child', { gender })}
        </label>
      ))}
    </div>
  );
}

/**
 * Add several children at once (REL-03, REL-04, DESIGN §21.6): one row each with a
 * son/daughter toggle; Enter adds a row and pasting a list makes one row per line. They
 * keep the typed order, link to the chosen other parent, and undo as one step.
 */
export function BulkAddChildren({
  personId,
  welcome = false,
  onClose,
}: {
  personId: ID;
  /** Step 3 of the first-run wizard: a line saying what this is and that it can wait. */
  welcome?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('relatives');
  const to = useTranslations('onboarding');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const editor = useEditor();
  const issueText = useIssueText();
  const graph = useTree(selectGraph);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [otherParent, setOtherParent] = useState<ID | null>(() => {
    const resolved = resolveOtherParent(graph, personId, undefined);
    return resolved.ok ? resolved.id : null;
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const focusKey = useRef<number | null>(null);
  const groupName = useId();

  useEffect(() => {
    if (focusKey.current === null) return;
    inputs.current.get(focusKey.current)?.focus();
    focusKey.current = null;
  }, [rows]);

  const person = graph.persons.get(personId);
  if (!person) return null;
  const nameOf = (id: ID) => {
    const p = graph.persons.get(id);
    return p ? displayName(p.names, nameDisplay, locale).text : '';
  };
  const partners = otherParentChoices(graph, personId);
  const parents = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    [personId, ...(otherParent ? [otherParent] : [])].map(nameOf),
  );
  const filled = rows.filter((row) => row.name.trim());

  const clearProblems = () => {
    setErrors([]);
    setWarnings([]);
  };
  const update = (key: number, patch: Partial<Row>) => {
    clearProblems();
    setRows((all) => all.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };
  const insertAfter = (key: number, added: Row[]) => {
    if (added.length === 0) return;
    focusKey.current = added[added.length - 1]!.key;
    setRows((all) => {
      const index = all.findIndex((row) => row.key === key);
      return [...all.slice(0, index + 1), ...added, ...all.slice(index + 1)].slice(0, MAX_ROWS);
    });
  };
  const remove = (key: number) => {
    clearProblems();
    setRows((all) => (all.length === 1 ? [newRow()] : all.filter((row) => row.key !== key)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, row: Row, index: number) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const next = rows[index + 1];
    if (next) inputs.current.get(next.key)?.focus();
    else if (row.name.trim() && rows.length < MAX_ROWS) insertAfter(row.key, [newRow()]);
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>, row: Row) => {
    const lines = event.clipboardData
      .getData('text')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return;
    event.preventDefault();
    update(row.key, { name: lines[0]!.slice(0, LIMITS.personName) });
    insertAfter(
      row.key,
      lines.slice(1).map((line) => newRow(line.slice(0, LIMITS.personName))),
    );
  };

  const submit = (confirmed: boolean) => {
    if (filled.length === 0) {
      inputs.current.get(rows[0]!.key)?.focus();
      return;
    }
    const children = filled.map((row) => ({ names: nameFromText(row.name), gender: row.gender }));
    const result = editor.run(
      (ctx) => addChildren(ctx, personId, children, { otherParentId: otherParent }),
      { allowWarnings: confirmed },
    );
    if (!result.ok) {
      setErrors([...new Set(result.issues.map(issueText))]);
      return;
    }
    if (result.warnings.length > 0 && !confirmed) {
      setWarnings([...new Set(result.warnings.map(issueText))]);
      return;
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(FORM_DIALOG, 'sm:max-w-lg')}>
        <DialogHeader>
          <DialogTitle>{t('childrenTitle')}</DialogTitle>
          <DialogDescription>{t('childrenOf', { names: parents })}</DialogDescription>
          {welcome && (
            <p className="rounded-lg bg-highlight/15 px-3 py-2 text-sm">
              {to('step', { current: 3, total: 3 })} · {to('childrenHint')}
            </p>
          )}
        </DialogHeader>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit(warnings.length > 0);
          }}
        >
          <ol className="space-y-2">
            {rows.map((row, index) => (
              // Phones: the name and its remove button, then son or daughter below; wider
              // screens: one row. The order in the page (and for Tab) stays the same.
              <li
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
              >
                <Input
                  ref={(element) => {
                    if (element) inputs.current.set(row.key, element);
                    else inputs.current.delete(row.key);
                  }}
                  aria-label={t('childName', { number: index + 1 })}
                  autoFocus={index === 0}
                  autoComplete="off"
                  maxLength={LIMITS.personName}
                  value={row.name}
                  onChange={(event) => update(row.key, { name: event.target.value })}
                  onKeyDown={(event) => onKeyDown(event, row, index)}
                  onPaste={(event) => onPaste(event, row)}
                  className="order-1 h-11 min-w-0 text-base"
                />
                <SonOrDaughter
                  className="order-3 col-span-2 sm:order-2 sm:col-span-1"
                  row={row}
                  number={index + 1}
                  onChange={(gender) => update(row.key, { gender })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="order-2 size-11 shrink-0 sm:order-3"
                  aria-label={t('removeChild', { number: index + 1 })}
                  onClick={() => remove(row.key)}
                >
                  <XIcon aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
          {rows.length < MAX_ROWS && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full justify-start border-dashed"
              onClick={() => insertAfter(rows[rows.length - 1]!.key, [newRow()])}
            >
              <PlusIcon aria-hidden /> {t('anotherChild')}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">{t('pasteHint')}</p>

          {partners.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t('otherParent')}</legend>
              <div className="flex flex-wrap gap-2 pt-1">
                {[...partners, null].map((id) => (
                  <label
                    key={id ?? 'none'}
                    className="flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm transition-colors hover:bg-accent has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
                  >
                    <input
                      type="radio"
                      name={groupName}
                      checked={otherParent === id}
                      onChange={() => {
                        clearProblems();
                        setOtherParent(id);
                      }}
                      className="sr-only"
                    />
                    {id ? nameOf(id) : t('otherParentUnknown')}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <FormError message={errors.join(' ') || null} />
          {warnings.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
            >
              {warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" className="h-11" disabled={filled.length === 0}>
              {warnings.length > 0 ? t('addAnyway') : t('addChildren', { count: filled.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

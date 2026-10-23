'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormError, FormField } from '@/features/auth/FormField';
import { useValidationText } from '@/features/auth/useMessages';
import {
  addParent,
  addSibling,
  addSpouse,
  linkExisting,
  type BuildResult,
  type CommandContext,
  type LinkSpec,
} from '@/features/editor/commands';
import { useEditor } from '@/features/editor/EditorProvider';
import { useIssueText } from '@/features/editor/useIssueText';
import { parentsOf } from '@/lib/domain/graph';
import { displayName, nameFromText } from '@/lib/domain/names';
import { likelySpouseGender, missingParentGender, spouseRelation } from '@/lib/domain/relatives';
import { LIMITS } from '@/lib/domain/schemas';
import type { ID, Issue, Locale, Person } from '@/lib/domain/types';
import { selectGraph, useTree } from '@/stores/treeStore';

import { GenderChoice } from './GenderChoice';
import { PersonPicker } from './PersonPicker';

export type RelativeKind = 'spouse' | 'parent' | 'sibling' | 'link';
type LinkAs = 'child' | 'spouse' | 'parent';

/** Dialogs sit at the top on phones, so the keyboard never covers them. */
export const FORM_DIALOG =
  'top-4 max-h-[calc(100dvh-2rem)] translate-y-0 overflow-y-auto sm:top-[50%] sm:max-w-md sm:translate-y-[-50%]';

function useRun() {
  const editor = useEditor();
  const issueText = useIssueText();
  const [problems, setProblems] = useState<{ errors: string[]; warnings: string[] }>({
    errors: [],
    warnings: [],
  });
  const reset = () => setProblems({ errors: [], warnings: [] });
  /** Runs; returns true when the command ran. Warnings need a second, confirming call. */
  const run = (build: (ctx: CommandContext) => BuildResult, confirmed: boolean) => {
    const result = editor.run(build, { allowWarnings: confirmed });
    const text = (issues: Issue[]) => [...new Set(issues.map(issueText))];
    if (!result.ok) {
      setProblems({ errors: text(result.issues), warnings: [] });
      return false;
    }
    if (result.warnings.length > 0 && !confirmed) {
      setProblems({ errors: [], warnings: text(result.warnings) });
      return false;
    }
    reset();
    return true;
  };
  return { run, problems, reset };
}

function Problems({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  return (
    <>
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
    </>
  );
}

/** Pick someone already in the tree as a child, spouse or parent (REL-06). */
function LinkExisting({
  person,
  initialAs,
  onDone,
}: {
  person: Person;
  initialAs: LinkAs;
  onDone: () => void;
}) {
  const t = useTranslations('relatives');
  const graph = useTree(selectGraph);
  const [as, setAs] = useState<LinkAs>(initialAs);
  const [picked, setPicked] = useState<ID | null>(null);
  const { run, problems, reset } = useRun();
  const exclude = useMemo(() => new Set([person.id]), [person.id]);
  const groupId = useId();

  const spec = (other: ID): LinkSpec =>
    as === 'child'
      ? { type: 'parent', parentId: person.id, childId: other }
      : as === 'parent'
        ? { type: 'parent', parentId: other, childId: person.id }
        : { type: 'spouse', personId: person.id, partnerId: other };

  const link = (other: ID, confirmed: boolean) => {
    setPicked(other);
    if (run((ctx) => linkExisting(ctx, spec(other)), confirmed)) onDone();
  };

  return (
    <div className="space-y-4">
      <fieldset className="space-y-1.5">
        <legend id={groupId} className="text-sm font-medium">
          {t('linkAs')}
        </legend>
        <div className="grid grid-cols-3 gap-2 pt-1.5">
          {(['child', 'spouse', 'parent'] as const).map((value) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-1 text-center text-sm font-medium transition-colors hover:bg-accent has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
            >
              <input
                type="radio"
                name={groupId}
                value={value}
                checked={as === value}
                onChange={() => {
                  setAs(value);
                  reset();
                }}
                className="sr-only"
              />
              {t(
                value === 'child'
                  ? 'linkAsChild'
                  : value === 'spouse'
                    ? 'linkAsSpouse'
                    : 'linkAsParent',
              )}
            </label>
          ))}
        </div>
      </fieldset>
      <PersonPicker exclude={exclude} onPick={(id) => link(id, false)} />
      <Problems {...problems} />
      {problems.warnings.length > 0 && picked && graph.persons.has(picked) && (
        <Button className="h-11 w-full" onClick={() => link(picked, true)}>
          {t('addAnyway')}
        </Button>
      )}
    </div>
  );
}

/**
 * Add a husband or wife, a father or mother, or a brother or sister with just a name
 * (PER-01, REL-02, REL-05), or link someone already in the tree (REL-06).
 */
export function AddRelativeDialog({
  personId,
  kind,
  onClose,
  onSwitch,
}: {
  personId: ID;
  kind: RelativeKind;
  onClose: () => void;
  /** Sibling without parents: start adding a parent instead. */
  onSwitch: (kind: RelativeKind) => void;
}) {
  const t = useTranslations('relatives');
  const tc = useTranslations('common');
  const validation = useValidationText();
  const graph = useTree(selectGraph);
  const person = graph.persons.get(personId);
  const [existing, setExisting] = useState(kind === 'link');
  const [name, setName] = useState('');
  const relation = spouseRelation(person?.gender ?? 'unknown');
  const [gender, setGender] = useState<'male' | 'female' | null>(() => {
    if (!person) return null;
    if (kind === 'spouse') return likelySpouseGender(person.gender);
    if (kind === 'parent') return missingParentGender(graph, person.id);
    return null;
  });
  const [errors, setErrors] = useState<{ name?: string; gender?: string }>({});
  const { run, problems, reset } = useRun();
  const locale = useLocale() as Locale;
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const tp = useTranslations('person');

  if (!person) return null;
  const shown = displayName(person.names, nameDisplay, locale).text;
  const formKind = kind === 'link' ? 'spouse' : kind;
  const noParents = kind === 'sibling' && parentsOf(graph, person.id).length === 0;
  const title = existing
    ? t('linkTitle')
    : formKind === 'spouse'
      ? t('spouseTitle', { relation })
      : formKind === 'parent'
        ? t('parentTitle')
        : t('siblingTitle');
  const description =
    kind === 'link'
      ? t('menuTitle', { name: shown })
      : formKind === 'spouse'
        ? t('spouseOf', { name: shown })
        : formKind === 'parent'
          ? t('parentOf', { name: shown })
          : t('siblingOf', { name: shown });
  const roleLabels = {
    male: t(`roles.${formKind}`, { gender: 'male' }),
    female: t(`roles.${formKind}`, { gender: 'female' }),
  };

  const submit = (confirmed: boolean) => {
    const text = name.trim();
    const nameError = !text
      ? validation('nameRequired')
      : text.length > LIMITS.personName
        ? validation('nameTooLong')
        : undefined;
    const genderError = gender ? undefined : validation('genderRequired');
    setErrors({ name: nameError, gender: genderError });
    if (nameError || genderError || !gender) return;
    const input = { names: nameFromText(text), gender };
    const ran = run(
      (ctx) =>
        formKind === 'spouse'
          ? addSpouse(ctx, person.id, input)
          : formKind === 'parent'
            ? addParent(ctx, person.id, input)
            : addSibling(ctx, person.id, input),
      confirmed,
    );
    if (ran) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={FORM_DIALOG}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {existing ? (
          <LinkExisting
            person={person}
            initialAs={kind === 'parent' ? 'parent' : kind === 'spouse' ? 'spouse' : 'child'}
            onDone={onClose}
          />
        ) : noParents ? (
          <div className="space-y-4">
            <p className="text-muted-foreground">{t('noParentsHint')}</p>
            <Button className="h-11 w-full" onClick={() => onSwitch('parent')}>
              {t('addParentFirst')}
            </Button>
          </div>
        ) : (
          <form
            noValidate
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              submit(problems.warnings.length > 0);
            }}
          >
            <FormField
              label={tp('nameLabel')}
              placeholder={tp('namePlaceholder')}
              hint={tp('nameHint')}
              autoComplete="off"
              autoFocus
              value={name}
              error={errors.name}
              onChange={(event) => {
                setName(event.target.value);
                reset();
              }}
            />
            <GenderChoice
              legend={t('roleLabel')}
              labels={roleLabels}
              name="gender"
              selected={gender}
              error={errors.gender}
              onChange={(event) => {
                setGender(event.target.value as 'male' | 'female');
                reset();
              }}
            />
            <Problems {...problems} />
            <DialogFooter>
              <Button type="button" variant="outline" className="h-11" onClick={onClose}>
                {tc('cancel')}
              </Button>
              <Button type="submit" className="h-11">
                {problems.warnings.length > 0 ? t('addAnyway') : t('add')}
              </Button>
            </DialogFooter>
          </form>
        )}
        {kind !== 'sibling' && (
          <button
            type="button"
            className="text-sm text-primary underline-offset-4 hover:underline"
            onClick={() => {
              setExisting(!existing);
              reset();
            }}
          >
            {existing ? t('useNew') : t('useExisting')}
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

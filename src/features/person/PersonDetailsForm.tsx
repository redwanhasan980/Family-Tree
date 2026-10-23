'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/features/auth/FormField';
import { updatePerson } from '@/features/editor/commands';
import { useEditor } from '@/features/editor/EditorProvider';
import { useIssueText } from '@/features/editor/useIssueText';
import { draftFromPerson, patchFromDraft, type DetailsDraft } from '@/lib/domain/personForms';
import type { Gender, Person } from '@/lib/domain/types';

import { PartialDateInput } from './PartialDateInput';

/** PER-05: edits save themselves after a short pause. */
const SAVE_DELAY_MS = 800;
type Field = 'nameEn' | 'nameBn' | 'nickname' | 'birth' | 'death';

/** Which form field a validation issue (`params.field`) belongs to. */
function fieldOf(path: string): Field | null {
  if (path === 'names.en' || path === 'names') return 'nameEn';
  if (path === 'names.bn') return 'nameBn';
  if (path.startsWith('nickname')) return 'nickname';
  if (path.startsWith('birth')) return 'birth';
  if (path.startsWith('death')) return 'death';
  return null;
}

function GenderButtons({ value, onChange }: { value: Gender; onChange: (gender: Gender) => void }) {
  const t = useTranslations('person');
  const name = useId();
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{t('gender')}</legend>
      <div className="grid grid-cols-3 gap-2 pt-1">
        {(['male', 'female', 'unknown'] as const).map((gender) => (
          <label
            key={gender}
            className="flex h-11 cursor-pointer items-center justify-center rounded-md border text-sm font-medium transition-colors hover:bg-accent has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name={name}
              value={gender}
              checked={value === gender}
              onChange={() => onChange(gender)}
              className="sr-only"
            />
            {t(gender)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The core details of a person (P4-08, PER-04/05): names in both languages, nickname,
 * gender, living or not, birth and death dates. There is no Save button: changes save
 * after a short pause or when a field loses focus, and quick edits undo as one step.
 */
export function PersonDetailsForm({ person }: { person: Person }) {
  const t = useTranslations('person');
  const editor = useEditor();
  const issueText = useIssueText();
  const [draft, setDraft] = useState<DetailsDraft>(() => draftFromPerson(person));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [synced, setSynced] = useState(person);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const pending = useRef<{ draft: DetailsDraft; person: Person } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const livingId = useId();

  // Follow changes made elsewhere (undo, another device) while nobody is typing here.
  if (person !== synced && !editing && !dirty) {
    setSynced(person);
    setDraft(draftFromPerson(person));
  }

  const save = useCallback(() => {
    window.clearTimeout(timer.current);
    const job = pending.current;
    pending.current = null;
    if (!job) return;
    setDirty(false);
    const patch = patchFromDraft(job.person, job.draft);
    const result = editor.run((ctx) => updatePerson(ctx, job.person.id, patch));
    if (result.ok || result.issues.every((i) => i.code === 'noChanges')) {
      setErrors({});
      return;
    }
    const next: Partial<Record<Field, string>> = {};
    for (const issue of result.issues) {
      const field = fieldOf(String(issue.params?.field ?? ''));
      if (field && !next[field]) next[field] = issueText(issue);
    }
    setErrors(next);
  }, [editor, issueText]);

  // Save what's left when the panel closes or switches to someone else.
  useEffect(() => save, [person.id, save]);

  const change = (patch: Partial<DetailsDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setDirty(true);
    pending.current = { draft: next, person };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(save, SAVE_DELAY_MS);
  };
  const changeNow = (patch: Partial<DetailsDraft>) => {
    change(patch);
    save();
  };

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      onFocus={() => setEditing(true)}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setEditing(false);
        save();
      }}
    >
      <FormField
        label={t('nameBn')}
        lang="bn"
        autoComplete="off"
        value={draft.nameBn}
        error={errors.nameBn}
        onChange={(event) => change({ nameBn: event.target.value })}
      />
      <FormField
        label={t('nameEn')}
        lang="en"
        autoComplete="off"
        value={draft.nameEn}
        error={errors.nameEn}
        onChange={(event) => change({ nameEn: event.target.value })}
      />
      <FormField
        label={t('nickname')}
        autoComplete="off"
        value={draft.nickname}
        error={errors.nickname}
        onChange={(event) => change({ nickname: event.target.value })}
      />
      <GenderButtons value={draft.gender} onChange={(gender) => changeNow({ gender })} />
      <PartialDateInput
        legend={t('born')}
        value={draft.birth}
        error={errors.birth}
        onChange={(birth) => change({ birth })}
      />
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={livingId} className="text-base font-normal">
          {t('living')}
        </Label>
        <Switch
          id={livingId}
          checked={draft.isLiving}
          onCheckedChange={(isLiving) => changeNow({ isLiving })}
        />
      </div>
      {!draft.isLiving && (
        <PartialDateInput
          legend={t('died')}
          value={draft.death}
          error={errors.death}
          onChange={(death) => change({ death })}
        />
      )}
    </form>
  );
}

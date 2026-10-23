'use client';

import { PlusIcon, XIcon } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/features/auth/FormField';
import { updatePerson } from '@/features/editor/commands';
import { useEditor } from '@/features/editor/EditorProvider';
import { useIssueText } from '@/features/editor/useIssueText';
import {
  draftFieldOf,
  draftFromPerson,
  patchFromDraft,
  type CustomFieldDraft,
  type DetailsDraft,
} from '@/lib/domain/personForms';
import { LIMITS } from '@/lib/domain/schemas';
import type { Gender, Person } from '@/lib/domain/types';

import { PartialDateInput } from './PartialDateInput';

/** PER-05: edits save themselves after a short pause. */
const SAVE_DELAY_MS = 800;

type TextKey =
  | 'nameBn'
  | 'nameEn'
  | 'nickname'
  | 'birthPlace'
  | 'deathPlace'
  | 'profession'
  | 'education'
  | 'email';

let customKey = 0;
const newCustomField = (): CustomFieldDraft => ({
  id: `f${Date.now().toString(36)}${(customKey++).toString(36)}`,
  label: '',
  value: '',
});

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t pt-4">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Approximate({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  const t = useTranslations('person');
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 accent-primary"
      />
      {t('approximate')}
    </label>
  );
}

/** A multi-line field with a character counter (PER-02). */
function TextAreaField({
  label,
  hint,
  value,
  max,
  error,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  max: number;
  error?: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('person');
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={max}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-count${hint ? ` ${id}-hint` : ''}${error ? ` ${id}-error` : ''}`}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-20 text-base leading-relaxed"
      />
      <div className="flex justify-between gap-3 text-sm text-muted-foreground">
        <span id={`${id}-hint`}>{hint}</span>
        <span id={`${id}-count`} className="shrink-0 tabular-nums">
          {t('count', { count: value.length, max })}
        </span>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Every detail of a person (P5-01, PER-02/03/05): names in both languages, nickname,
 * gender, living or not, birth and death with dates and places, work, contact details,
 * a description and extra fields. There is no Save button: changes save after a short
 * pause or when a field loses focus, and quick edits undo as one step.
 */
export function PersonDetailsForm({ person }: { person: Person }) {
  const t = useTranslations('person');
  const format = useFormatter();
  const editor = useEditor();
  const issueText = useIssueText();
  const [draft, setDraft] = useState<DetailsDraft>(() => draftFromPerson(person));
  const [errors, setErrors] = useState<Record<string, string>>({});
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
    const result = editor.run((ctx) => updatePerson(ctx, job.person.id, patchFromDraft(job.draft)));
    if (result.ok || result.issues.every((i) => i.code === 'noChanges')) {
      setErrors({});
      return;
    }
    const next: Record<string, string> = {};
    for (const issue of result.issues) {
      const field = draftFieldOf(String(issue.params?.field ?? ''), job.draft);
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
  const text = (key: TextKey, max: number) => ({
    value: draft[key],
    error: errors[key],
    maxLength: max,
    autoComplete: 'off',
  });

  const setPhone = (row: number, value: string) =>
    change({ phones: draft.phones.map((phone, i) => (i === row ? value : phone)) });
  const setCustom = (id: string, patch: Partial<CustomFieldDraft>) =>
    change({
      customFields: draft.customFields.map((field) =>
        field.id === id ? { ...field, ...patch } : field,
      ),
    });

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
        {...text('nameBn', LIMITS.personName)}
        onChange={(event) => change({ nameBn: event.target.value })}
      />
      <FormField
        label={t('nameEn')}
        lang="en"
        {...text('nameEn', LIMITS.personName)}
        onChange={(event) => change({ nameEn: event.target.value })}
      />
      <FormField
        label={t('nickname')}
        {...text('nickname', LIMITS.nickname)}
        onChange={(event) => change({ nickname: event.target.value })}
      />
      <GenderButtons value={draft.gender} onChange={(gender) => changeNow({ gender })} />
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

      <Section title={t('sectionLife')}>
        <PartialDateInput
          legend={t('born')}
          value={draft.birth}
          error={errors.birth}
          onChange={(birth) => change({ birth })}
        />
        <Approximate
          checked={draft.birthApprox}
          onChange={(birthApprox) => changeNow({ birthApprox })}
        />
        <FormField
          label={t('birthPlace')}
          {...text('birthPlace', LIMITS.shortText)}
          onChange={(event) => change({ birthPlace: event.target.value })}
        />
        {!draft.isLiving && (
          <>
            <PartialDateInput
              legend={t('died')}
              value={draft.death}
              error={errors.death}
              onChange={(death) => change({ death })}
            />
            <Approximate
              checked={draft.deathApprox}
              onChange={(deathApprox) => changeNow({ deathApprox })}
            />
            <FormField
              label={t('deathPlace')}
              {...text('deathPlace', LIMITS.shortText)}
              onChange={(event) => change({ deathPlace: event.target.value })}
            />
          </>
        )}
      </Section>

      <Section title={t('sectionWork')}>
        <FormField
          label={t('profession')}
          {...text('profession', LIMITS.shortText)}
          onChange={(event) => change({ profession: event.target.value })}
        />
        <FormField
          label={t('education')}
          {...text('education', LIMITS.shortText)}
          onChange={(event) => change({ education: event.target.value })}
        />
      </Section>

      <Section title={t('sectionContact')}>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('phones')}</legend>
          {draft.phones.map((phone, row) => (
            <div key={row} className="space-y-1">
              <div className="flex gap-2 pt-1">
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  aria-label={t('phone', { number: format.number(row + 1) })}
                  maxLength={LIMITS.phone}
                  value={phone}
                  aria-invalid={errors[`phone:${row}`] ? true : undefined}
                  onChange={(event) => setPhone(row, event.target.value)}
                  className="h-11 text-base"
                />
                {(draft.phones.length > 1 || phone) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    aria-label={t('removePhone', { number: format.number(row + 1) })}
                    onClick={() => {
                      const phones = draft.phones.filter((_, i) => i !== row);
                      changeNow({ phones: phones.length > 0 ? phones : [''] });
                    }}
                  >
                    <XIcon aria-hidden />
                  </Button>
                )}
              </div>
              {errors[`phone:${row}`] && (
                <p className="text-sm text-destructive">{errors[`phone:${row}`]}</p>
              )}
            </div>
          ))}
          {errors.phones && <p className="text-sm text-destructive">{errors.phones}</p>}
          {draft.phones.length < LIMITS.phones && (
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-2"
              onClick={() => change({ phones: [...draft.phones, ''] })}
            >
              <PlusIcon aria-hidden /> {t('addPhone')}
            </Button>
          )}
        </fieldset>
        <FormField
          label={t('email')}
          {...text('email', LIMITS.email)}
          onChange={(event) => change({ email: event.target.value })}
          type="email"
          inputMode="email"
          lang="en"
        />
        <TextAreaField
          label={t('presentAddress')}
          value={draft.presentAddress}
          max={LIMITS.address}
          error={errors.presentAddress}
          onChange={(presentAddress) => change({ presentAddress })}
        />
        <TextAreaField
          label={t('permanentAddress')}
          value={draft.permanentAddress}
          max={LIMITS.address}
          error={errors.permanentAddress}
          onChange={(permanentAddress) => change({ permanentAddress })}
        />
      </Section>

      <Section title={t('sectionAbout')}>
        <TextAreaField
          label={t('description')}
          hint={t('descriptionHint')}
          value={draft.description}
          max={LIMITS.description}
          error={errors.description}
          onChange={(description) => change({ description })}
        />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('customFields')}</legend>
          <p className="text-sm text-muted-foreground">{t('customHint')}</p>
          {draft.customFields.map((field, index) => {
            const number = format.number(index + 1);
            const error = errors[`custom:${field.id}:label`] ?? errors[`custom:${field.id}:value`];
            return (
              <div key={field.id} className="space-y-1">
                <div className="flex gap-2">
                  <Input
                    aria-label={t('customLabel', { number })}
                    placeholder={t('customLabelPlaceholder')}
                    autoComplete="off"
                    maxLength={LIMITS.customLabel}
                    value={field.label}
                    aria-invalid={errors[`custom:${field.id}:label`] ? true : undefined}
                    onChange={(event) => setCustom(field.id, { label: event.target.value })}
                    className="h-11 w-2/5 text-base"
                  />
                  <Input
                    aria-label={t('customValue', { number })}
                    placeholder={t('customValuePlaceholder')}
                    autoComplete="off"
                    maxLength={LIMITS.customValue}
                    value={field.value}
                    aria-invalid={errors[`custom:${field.id}:value`] ? true : undefined}
                    onChange={(event) => setCustom(field.id, { value: event.target.value })}
                    className="h-11 min-w-0 flex-1 text-base"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    aria-label={t('removeCustomField', { number })}
                    onClick={() =>
                      changeNow({
                        customFields: draft.customFields.filter((f) => f.id !== field.id),
                      })
                    }
                  >
                    <XIcon aria-hidden />
                  </Button>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            );
          })}
          {errors.customFields && <p className="text-sm text-destructive">{errors.customFields}</p>}
          {draft.customFields.length < LIMITS.customFields && (
            <Button
              type="button"
              variant="ghost"
              className="h-11 px-2"
              onClick={() => change({ customFields: [...draft.customFields, newCustomField()] })}
            >
              <PlusIcon aria-hidden /> {t('addCustomField')}
            </Button>
          )}
        </fieldset>
      </Section>
    </form>
  );
}

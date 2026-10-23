'use client';

import {
  CameraIcon,
  CheckIcon,
  FocusIcon,
  HistoryIcon,
  PencilIcon,
  StarIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UserRoundCheckIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { usePersonText } from '@/features/editor/shell/usePersonText';
import { useIssueText } from '@/features/editor/useIssueText';
import { Avatar } from '@/features/media/Avatar';
import { photosEnabled } from '@/features/media/cloudinaryUrl';
import { Lightbox } from '@/features/media/Lightbox';
import { PhotoDialog } from '@/features/media/PhotoDialog';
import { ageAt, today } from '@/lib/domain/dates';
import { personDateWarnings } from '@/lib/domain/graph';
import { displayName } from '@/lib/domain/names';
import type { ID, Locale, Person } from '@/lib/domain/types';
import { selectGraph, useTree } from '@/stores/treeStore';
import { uiStore } from '@/stores/uiStore';

import { RelativeActions } from './AddRelativeFlows';
import { PersonDetailsForm } from './PersonDetailsForm';
import { PersonFamily } from './PersonFamily';
import { PersonSummary } from './PersonSummary';
import { useSelfPerson } from './useSelfPerson';

/** "73 years old" for the living, "died at the age of 73" otherwise (PER-09). */
function useAgeText(person: Person, now: Date): string {
  const t = useTranslations('person');
  const born = person.birth?.date;
  if (!born) return '';
  const end = person.isLiving ? today(now) : person.death?.date;
  const age = end ? ageAt(born, end) : null;
  if (!age) return '';
  if (person.isLiving) return t(age.approximate ? 'ageApprox' : 'age', { years: age.years });
  return t(age.approximate ? 'ageAtDeathApprox' : 'ageAtDeath', { years: age.years });
}

function SelfStar() {
  return (
    <StarIcon className="absolute -top-1 -left-1 size-6 fill-highlight text-highlight drop-shadow-sm" />
  );
}

/** Unlikely dates around this person, naming the relative when it's about them. */
function DateWarnings({ person, now }: { person: Person; now: Date }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const issueText = useIssueText();
  const graph = useTree(selectGraph);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  const issues = personDateWarnings(graph, person.id, now);
  if (issues.length === 0) return null;
  const line = (issue: (typeof issues)[number]) => {
    const relativeId = issue.params?.personId as ID | undefined;
    const relative = relativeId ? graph.persons.get(relativeId) : undefined;
    if (!relative) return issueText(issue);
    const role = t(`relatives.roles.${issue.params?.relation === 'parent' ? 'parent' : 'child'}`, {
      gender: relative.gender,
    });
    return t('person.relativeIssue', {
      role,
      name: displayName(relative.names, nameDisplay, locale).text,
      issue: issueText(issue),
    });
  };
  return (
    <div role="note" className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <TriangleAlertIcon className="size-4 shrink-0" aria-hidden /> {t('person.checkDates')}
      </p>
      <ul className="list-disc space-y-1 pl-6 text-sm">
        {issues.map((issue, i) => (
          <li key={i}>{line(issue)}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Everything about one person (PER-04): who they are, quick ways to add relatives, their
 * details (read, or edited with autosave), their family with the relationship editors,
 * "This is me", showing the tree from them, and deleting them.
 */
export function PersonPanel({ person }: { person: Person }) {
  const t = useTranslations('person');
  const { name, years } = usePersonText(person);
  const { selfId, setSelf } = useSelfPerson();
  const [editingId, setEditingId] = useState<ID | null>(null);
  // Read once per panel: ages and "living at 130" checks don't need to tick.
  const [now] = useState(() => new Date());
  const editing = editingId === person.id;
  const isSelf = selfId === person.id;
  const age = useAgeText(person, now);
  const tm = useTranslations('media');
  const tv = useTranslations('treeView');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const canAddPhotos = photosEnabled();

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {person.photo ? (
            <button
              type="button"
              className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label={tm('view', { name: name.text })}
              onClick={() => setLightboxOpen(true)}
            >
              <Avatar name={name} photo={person.photo} size="lg">
                {isSelf && <SelfStar />}
              </Avatar>
            </button>
          ) : (
            <Avatar name={name} size="lg">
              {isSelf && <SelfStar />}
            </Avatar>
          )}
          {canAddPhotos && (
            <button
              type="button"
              className="group absolute -right-3 -bottom-3 flex size-11 items-center justify-center rounded-full outline-none"
              aria-label={person.photo ? tm('changePhoto') : tm('addPhoto')}
              onClick={() => setPhotoOpen(true)}
            >
              <span className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm group-hover:bg-primary/90 group-focus-visible:ring-[3px] group-focus-visible:ring-ring/50">
                <CameraIcon className="size-4" aria-hidden />
              </span>
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 lang={name.lang} className="text-lg leading-snug font-semibold">
            {name.text}
          </h2>
          {name.secondary && (
            <p lang={name.secondary.lang} className="text-sm text-muted-foreground">
              {name.secondary.text}
            </p>
          )}
          {(years || age) && (
            <p className="text-sm text-muted-foreground">
              <span className="tabular-nums">{years}</span>
              {years && age && ' · '}
              {age}
            </p>
          )}
          {isSelf && <p className="text-sm font-medium text-primary">{t('markedMe')}</p>}
        </div>
        <Button
          variant={editing ? 'default' : 'outline'}
          className="h-11 shrink-0"
          aria-pressed={editing}
          onClick={() => setEditingId(editing ? null : person.id)}
        >
          {editing ? <CheckIcon aria-hidden /> : <PencilIcon aria-hidden />}
          {editing ? t('done') : t('edit')}
        </Button>
      </div>

      <RelativeActions personId={person.id} />
      <Separator />
      <section className="space-y-3" aria-label={t('details')}>
        {editing ? (
          <>
            <PersonDetailsForm key={person.id} person={person} />
            <Button className="h-11 w-full" onClick={() => setEditingId(null)}>
              <CheckIcon aria-hidden /> {t('done')}
            </Button>
          </>
        ) : (
          <>
            <DateWarnings person={person} now={now} />
            <PersonSummary person={person} onEdit={() => setEditingId(person.id)} />
          </>
        )}
      </section>
      <Separator />
      <section className="space-y-3" aria-label={t('family')}>
        <h3 className="font-semibold">{t('family')}</h3>
        <PersonFamily personId={person.id} />
      </section>
      <Separator />
      {canAddPhotos && (
        <PhotoDialog person={person} name={name} open={photoOpen} onOpenChange={setPhotoOpen} />
      )}
      {person.photo && (
        <Lightbox
          name={name}
          photo={person.photo}
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
        />
      )}
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="h-11 justify-start"
          aria-pressed={isSelf}
          onClick={() => setSelf(isSelf ? null : person.id)}
        >
          <UserRoundCheckIcon aria-hidden /> {isSelf ? t('notMe') : t('thisIsMe')}
        </Button>
        <Button
          variant="outline"
          className="h-11 justify-start"
          onClick={() => {
            uiStore.getState().focus(person.id);
            uiStore.getState().setView('tree');
            uiStore.getState().setDetailsOpen(false);
          }}
        >
          <FocusIcon aria-hidden /> {t('show')}
        </Button>
        <Button
          variant="outline"
          className="h-11 justify-start"
          onClick={() => {
            uiStore.getState().showAncestors(person.id);
            uiStore.getState().setDetailsOpen(false);
          }}
        >
          <HistoryIcon aria-hidden /> {tv('showAncestors')}
        </Button>
        <Button
          variant="ghost"
          className="h-11 justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => uiStore.getState().setDeleting(person.id)}
        >
          <Trash2Icon aria-hidden /> {t('delete')}
        </Button>
      </div>
    </div>
  );
}

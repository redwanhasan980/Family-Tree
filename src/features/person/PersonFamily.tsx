'use client';

import { ArrowDownIcon, ArrowUpIcon, CalendarIcon, MoveIcon, XIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  moveBranch,
  removeRelationship,
  reorderChildren,
  reorderSpouses,
  setParentKind,
  setSpouseStatus,
} from '@/features/editor/commands';
import { useEditor } from '@/features/editor/EditorProvider';
import { useChange } from '@/features/editor/useChange';
import { useIssueText } from '@/features/editor/useIssueText';
import { useUndoToast } from '@/features/editor/useUndoToast';
import { formatPartialDate } from '@/lib/domain/dates';
import {
  childrenOf,
  compareSpouseLinks,
  descendantIds,
  parentLinksOf,
  sortSiblings,
  spouseLinksOf,
} from '@/lib/domain/graph';
import { displayName } from '@/lib/domain/names';
import { dateDraft, dateFromDraft, type DateDraft } from '@/lib/domain/personForms';
import type { ID, Locale, ParentKind, SpouseLink, SpouseStatus } from '@/lib/domain/types';
import { selectGraph, useTree } from '@/stores/treeStore';
import { uiStore } from '@/stores/uiStore';

import { FORM_DIALOG } from './AddRelativeDialog';
import { PartialDateInput } from './PartialDateInput';
import { PersonPicker } from './PersonPicker';

const KINDS: readonly ParentKind[] = ['biological', 'adoptive', 'step', 'foster'];
const STATUSES: readonly SpouseStatus[] = ['married', 'divorced', 'separated', 'widowed'];
const SELECT =
  'h-9 max-w-36 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

function useName() {
  const locale = useLocale() as Locale;
  const persons = useTree((s) => s.persons);
  const nameDisplay = useTree((s) => s.tree?.settings.nameDisplay ?? 'auto');
  return (id: ID) => {
    const person = persons.get(id);
    return person
      ? displayName(person.names, nameDisplay, locale)
      : { text: '', lang: locale as Locale };
  };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Relative({ id, children, below }: { id: ID; children?: ReactNode; below?: ReactNode }) {
  const name = useName()(id);
  const row = (
    <div className="flex min-h-11 items-center gap-1">
      <button
        type="button"
        lang={name.lang}
        className="min-w-0 flex-1 truncate rounded-md px-2 py-2 text-left font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={() => uiStore.getState().select(id)}
      >
        {name.text}
      </button>
      {children}
    </div>
  );
  return (
    <li className="flex flex-col">
      {row}
      {below}
    </li>
  );
}

/**
 * A marriage's date (REL-01), saved when the boxes lose focus; shown as a line that opens
 * the boxes, so the family section stays short. A date that doesn't check keeps them open.
 */
function MarriageDate({ link, name }: { link: SpouseLink; name: string }) {
  const t = useTranslations('person');
  const locale = useLocale() as Locale;
  const editor = useEditor();
  const issueText = useIssueText();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateDraft>(() => dateDraft(link.marriageDate));
  const [error, setError] = useState<string>();

  const save = () => {
    const date = dateFromDraft(draft);
    const result = editor.run((ctx) =>
      setSpouseStatus(ctx, link.id, { marriageDate: date ?? null }),
    );
    if (result.ok || result.issues.every((i) => i.code === 'noChanges')) {
      setError(undefined);
      setOpen(false);
    } else {
      setError(issueText(result.issues[0]!));
    }
  };

  if (!open) {
    return (
      <Button
        variant="ghost"
        className="h-9 justify-start px-2 text-sm font-normal text-muted-foreground"
        onClick={() => {
          setDraft(dateDraft(link.marriageDate));
          setOpen(true);
        }}
      >
        <CalendarIcon aria-hidden />
        {link.marriageDate
          ? t('marriedOn', { date: formatPartialDate(link.marriageDate, locale) })
          : t('addMarriageDate')}
      </Button>
    );
  }
  return (
    <div
      className="w-full pb-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) save();
      }}
    >
      <PartialDateInput
        legend={t('marriageDateWith', { name })}
        value={draft}
        error={error}
        onChange={setDraft}
      />
    </div>
  );
}

/** Pick a new father or mother; everyone below follows (REL-08). */
function MoveBranchDialog({ personId, onClose }: { personId: ID; onClose: () => void }) {
  const t = useTranslations('person');
  const graph = useTree(selectGraph);
  const change = useChange();
  const exclude = new Set([personId, ...descendantIds(graph, personId)]);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={FORM_DIALOG}>
        <DialogHeader>
          <DialogTitle>{t('moveBranchTitle')}</DialogTitle>
          <DialogDescription>{t('moveBranchBody')}</DialogDescription>
        </DialogHeader>
        <PersonPicker
          exclude={exclude}
          onPick={(parentId) => {
            if (change((ctx) => moveBranch(ctx, personId, parentId))) {
              toast.success(t('moved'));
              onClose();
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * A person's parents, husbands or wives, and children, with the relationship editors of
 * REL-07..09: the kind of parent, the marriage status, the children's order, removing a
 * relationship (people stay), and moving the person under other parents.
 */
export function PersonFamily({ personId }: { personId: ID }) {
  const t = useTranslations('person');
  const graph = useTree(selectGraph);
  const nameOf = useName();
  const change = useChange();
  const undoToast = useUndoToast();
  const [moving, setMoving] = useState(false);

  const parents = parentLinksOf(graph, personId);
  const spouses = [...spouseLinksOf(graph, personId)].sort(compareSpouseLinks);
  const children = sortSiblings(
    childrenOf(graph, personId).flatMap((id) => graph.persons.get(id) ?? []),
  ).map((p) => p.id);

  const remove = (linkId: string) => {
    if (change((ctx) => removeRelationship(ctx, linkId))) undoToast(t('linkRemoved'));
  };
  const moveSpouse = (index: number, by: -1 | 1) => {
    const next = spouses.map((l) => l.id);
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved!);
    change((ctx) => reorderSpouses(ctx, personId, next));
  };
  const move = (index: number, by: -1 | 1) => {
    const next = [...children];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved!);
    change((ctx) => reorderChildren(ctx, personId, next));
  };
  const none = <p className="px-2 text-sm text-muted-foreground">{t('noneYet')}</p>;

  return (
    <div className="space-y-5">
      <Section title={t('parents')}>
        {parents.length === 0 ? (
          none
        ) : (
          <ul>
            {parents.map((link) => (
              <Relative key={link.id} id={link.parentId}>
                <select
                  className={SELECT}
                  aria-label={t('kindLabel', { name: nameOf(link.parentId).text })}
                  value={link.kind}
                  onChange={(event) =>
                    change((ctx) => setParentKind(ctx, link.id, event.target.value as ParentKind))
                  }
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`kinds.${kind}`)}
                    </option>
                  ))}
                </select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={t('removeLink', { name: nameOf(link.parentId).text })}
                  onClick={() => remove(link.id)}
                >
                  <XIcon aria-hidden />
                </Button>
              </Relative>
            ))}
          </ul>
        )}
        <Button variant="ghost" className="h-10 px-2 text-sm" onClick={() => setMoving(true)}>
          <MoveIcon aria-hidden /> {t('moveBranch')}
        </Button>
      </Section>

      <Section title={t('spouses')}>
        {spouses.length === 0 ? (
          none
        ) : (
          <ul>
            {spouses.map((link, index) => {
              const other = link.personIds[0] === personId ? link.personIds[1] : link.personIds[0];
              const name = nameOf(other).text;
              return (
                <Relative
                  key={link.id}
                  id={other}
                  below={
                    <div className="flex flex-wrap items-center gap-1 pb-1 pl-2">
                      <select
                        className={SELECT}
                        aria-label={t('statusLabel', { name: nameOf(other).text })}
                        value={link.status}
                        onChange={(event) =>
                          change((ctx) =>
                            setSpouseStatus(ctx, link.id, {
                              status: event.target.value as SpouseStatus,
                            }),
                          )
                        }
                      >
                        {STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {t(`statuses.${status}`)}
                          </option>
                        ))}
                      </select>
                      <MarriageDate key={link.id} link={link} name={name} />
                    </div>
                  }
                >
                  {spouses.length > 1 && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9"
                        disabled={index === 0}
                        aria-label={t('moveUp', { name })}
                        onClick={() => moveSpouse(index, -1)}
                      >
                        <ArrowUpIcon aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9"
                        disabled={index === spouses.length - 1}
                        aria-label={t('moveDown', { name })}
                        onClick={() => moveSpouse(index, 1)}
                      >
                        <ArrowDownIcon aria-hidden />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={t('removeLink', { name: nameOf(other).text })}
                    onClick={() => remove(link.id)}
                  >
                    <XIcon aria-hidden />
                  </Button>
                </Relative>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={t('children')}>
        {children.length === 0 ? (
          none
        ) : (
          <ol>
            {children.map((childId, index) => {
              const link = parentLinksOf(graph, childId).find((l) => l.parentId === personId);
              const name = nameOf(childId).text;
              return (
                <Relative key={childId} id={childId}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    disabled={index === 0}
                    aria-label={t('moveUp', { name })}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUpIcon aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    disabled={index === children.length - 1}
                    aria-label={t('moveDown', { name })}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownIcon aria-hidden />
                  </Button>
                  {link && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      aria-label={t('removeLink', { name })}
                      onClick={() => remove(link.id)}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  )}
                </Relative>
              );
            })}
          </ol>
        )}
      </Section>

      {moving && <MoveBranchDialog personId={personId} onClose={() => setMoving(false)} />}
    </div>
  );
}

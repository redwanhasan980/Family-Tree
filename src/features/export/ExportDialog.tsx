'use client';

import { DatabaseBackupIcon, LoaderCircleIcon, PrinterIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { UpgradeCard } from '@/features/auth/UpgradePrompt';
import { useUpgradePrompt } from '@/features/auth/useUpgradePrompt';
import { saveBackup } from '@/features/backup/json';
import { Choice, Row } from '@/features/editor/shell/TreeSettingsDialog';
import { photosEnabled } from '@/features/media/cloudinaryUrl';
import { APP_NAME } from '@/lib/brand';
import type { Locale, Tree } from '@/lib/domain/types';
import { logger } from '@/lib/logger';
import { useTree } from '@/stores/treeStore';
import { useUi } from '@/stores/uiStore';

import { deliverFile, exportFileName, type ExportView } from './files';
import {
  canExpand,
  DEFAULT_OPTIONS,
  EXPORT_VIEWS,
  readRemembered,
  toRemembered,
  type ExportFormat,
  type ExportOptions,
  type PdfPages,
} from './options';
import { PrintList } from './PrintList';
import { renderExport } from './render';
import { CircleScene } from './scenes/CircleScene';
import { FamilySheet } from './scenes/FamilySheet';
import { ListPages } from './scenes/ListPages';
import { TreeScene } from './scenes/TreeScene';

import type { Orientation, Paper } from './geometry';
import type { SceneHandle, SceneProps } from './scenes/scene';

const STORAGE_KEY = 'shikor:export';
const PAPERS: readonly Paper[] = ['a4', 'a3', 'letter', 'fit'];
const ORIENTATIONS: readonly Orientation[] = ['auto', 'portrait', 'landscape'];
const QUALITIES = ['1', '2', '3'] as const;

const SCENES: Record<ExportView, (props: SceneProps) => ReactNode> = {
  tree: TreeScene,
  circle: CircleScene,
  family: FamilySheet,
  list: ListPages,
};

function rememberedOptions(view: ExportView): ExportOptions {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the defaults will do.
  }
  return { ...DEFAULT_OPTIONS, ...readRemembered(raw), view };
}

/**
 * Renders a scene where nobody sees it (DESIGN §14): off screen but laid out (never
 * display:none), in the light theme, hidden from assistive technology and input.
 */
function ExportStage({ children }: { children: ReactNode }) {
  return createPortal(
    <div
      data-export
      aria-hidden
      inert
      className="pointer-events-none fixed top-0 font-sans text-foreground"
      style={{ left: -100_000 }}
    >
      {children}
    </div>,
    document.body,
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  // Beside its label on every screen, as switches are on phones.
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <Label htmlFor={id} className="text-base font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

interface Running {
  options: ExportOptions;
  title: string;
  subtitle: string;
}

/**
 * Save a view as a picture or PDF (P7-01, P7-05), or the whole tree as a backup
 * (P7-06). The choices are remembered in this browser; the export runs on a hidden
 * stage with progress and Cancel, then goes to the share sheet or a download.
 */
export default function ExportDialog({
  tree,
  open,
  onOpenChange,
}: {
  tree: Tree;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const id = useId();
  const currentView = useUi((s) => s.view);
  const pedigree = useUi((s) => s.pedigreeId !== null);
  const persons = useTree((s) => s.persons);
  const relationships = useTree((s) => s.relationships);
  const initialView = (EXPORT_VIEWS as readonly string[]).includes(currentView)
    ? (currentView as ExportView)
    : 'tree';
  const [options, setOptions] = useState<ExportOptions>(() => rememberedOptions(initialView));
  const [running, setRunning] = useState<Running | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [printing, setPrinting] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const stopPrinting = useCallback(() => setPrinting(false), []);
  // A guest hears about accounts before their first export (AUTH-03); saving counts as seen.
  const upgrade = useUpgradePrompt('firstExport');
  const { dismiss: seenUpgrade } = upgrade;

  const set = (patch: Partial<ExportOptions>) => setOptions((old) => ({ ...old, ...patch }));
  const svgView = options.view === 'tree' || options.view === 'circle';
  const showLegend = svgView && tree.settings.colorBy !== 'none';
  const showPhotos = photosEnabled() && tree.settings.showPhotos;
  const showExpand = canExpand(options.view) && !(options.view === 'tree' && pedigree);

  const start = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, toRemembered(options));
    } catch {
      // Not remembered this time.
    }
    controller.current = new AbortController();
    setProgress({ done: 0, total: 1 });
    setRunning({
      options: {
        ...options,
        photos: options.photos && showPhotos,
        legend: options.legend && showLegend,
        expandAll: options.expandAll && showExpand,
      },
      title: options.title.trim() || tree.name,
      subtitle: options.subtitle.trim(),
    });
  };

  const finish = () => {
    controller.current = null;
    setRunning(null);
    setProgress(null);
  };

  const onReady = useCallback(
    async (scene: SceneHandle) => {
      const job = running;
      const signal = controller.current?.signal;
      if (!job || !signal) return;
      try {
        const result = await renderExport(scene, job.options, {
          signal,
          onProgress: (done, total) => setProgress({ done, total }),
          title: job.title,
          creator: APP_NAME,
        });
        const name = exportFileName(tree.name, job.options.view, new Date(), job.options.format);
        const file = new File([result.blob], name, { type: result.blob.type });
        if (await deliverFile(file, job.title)) toast.success(t('export.saved', { file: name }));
        if (result.smallPt !== null) toast.info(t('export.smallText', { pt: result.smallPt }));
        if (result.reduced) toast.info(t('export.reduced'));
        seenUpgrade();
        onOpenChange(false);
      } catch (error) {
        if (!signal.aborted) {
          logger.warn('export.failed', { code: error instanceof Error ? error.name : 'unknown' });
          toast.error(t('export.failed'));
        }
      } finally {
        finish();
      }
    },
    [running, tree.name, t, onOpenChange, seenUpgrade],
  );

  const backup = async () => {
    try {
      const name = await saveBackup(tree, persons.values(), relationships.values());
      if (name) toast.success(t('export.backupSaved', { file: name }));
      seenUpgrade();
    } catch (error) {
      logger.warn('backup.failed', { code: error instanceof Error ? error.name : 'unknown' });
      toast.error(t('export.failed'));
    }
  };

  const Scene = running ? SCENES[running.options.view] : null;
  const percent = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  const busy = running !== null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) controller.current?.abort();
          onOpenChange(next);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('export.title')}</DialogTitle>
            <DialogDescription>{t('export.description')}</DialogDescription>
          </DialogHeader>
          {upgrade.visible && (
            <UpgradeCard id="firstExport" onDismiss={upgrade.dismiss} className="shadow-none" />
          )}

          <fieldset disabled={busy} className="space-y-4">
            <Row label={t('export.view')} htmlFor={`${id}-view`}>
              <Choice<ExportView>
                id={`${id}-view`}
                value={options.view}
                options={EXPORT_VIEWS}
                label={(v) => t(`views.name.${v}`)}
                onChange={(view) => set({ view })}
              />
            </Row>
            <Row label={t('export.format')} htmlFor={`${id}-format`}>
              <Choice<ExportFormat>
                id={`${id}-format`}
                value={options.format}
                options={['png', 'pdf']}
                label={(v) => t(`export.formats.${v}`)}
                onChange={(format) => set({ format })}
              />
            </Row>
            {options.format === 'pdf' && (
              <>
                <Row label={t('export.paper')} htmlFor={`${id}-paper`}>
                  <Choice<Paper>
                    id={`${id}-paper`}
                    value={options.paper}
                    options={PAPERS}
                    label={(v) => t(`export.papers.${v}`)}
                    onChange={(paper) => set({ paper })}
                  />
                </Row>
                {options.paper !== 'fit' && (
                  <Row label={t('export.orientation')} htmlFor={`${id}-orientation`}>
                    <Choice<Orientation>
                      id={`${id}-orientation`}
                      value={options.orientation}
                      options={ORIENTATIONS}
                      label={(v) => t(`export.orientations.${v}`)}
                      onChange={(orientation) => set({ orientation })}
                    />
                  </Row>
                )}
                {svgView && options.paper !== 'fit' && (
                  <Row label={t('export.pages')} htmlFor={`${id}-pages`}>
                    <Choice<PdfPages>
                      id={`${id}-pages`}
                      value={options.pages}
                      options={['one', 'tiles']}
                      label={(v) => t(`export.pagesOptions.${v}`)}
                      onChange={(pages) => set({ pages })}
                    />
                  </Row>
                )}
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor={`${id}-title`} className="text-base font-normal">
                {t('export.titleLabel')}
              </Label>
              <Input
                id={`${id}-title`}
                className="h-11 text-base"
                value={options.title}
                placeholder={tree.name}
                maxLength={120}
                onChange={(event) => set({ title: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-subtitle`} className="text-base font-normal">
                {t('export.subtitleLabel')}
              </Label>
              <Input
                id={`${id}-subtitle`}
                className="h-11 text-base"
                value={options.subtitle}
                maxLength={160}
                onChange={(event) => set({ subtitle: event.target.value })}
              />
            </div>
            {showPhotos && (
              <Toggle
                id={`${id}-photos`}
                label={t('export.photos')}
                checked={options.photos}
                onChange={(photos) => set({ photos })}
              />
            )}
            {showLegend && (
              <Toggle
                id={`${id}-legend`}
                label={t('export.legend')}
                checked={options.legend}
                onChange={(legend) => set({ legend })}
              />
            )}
            <Toggle
              id={`${id}-date`}
              label={t('export.date')}
              checked={options.date}
              onChange={(date) => set({ date })}
            />
            {showExpand && (
              <Toggle
                id={`${id}-expand`}
                label={t('export.expandAll')}
                checked={options.expandAll}
                onChange={(expandAll) => set({ expandAll })}
              />
            )}
            <Row label={t('export.quality')} htmlFor={`${id}-quality`}>
              <Choice<(typeof QUALITIES)[number]>
                id={`${id}-quality`}
                value={String(options.quality) as (typeof QUALITIES)[number]}
                options={QUALITIES}
                label={(v) => t(`export.qualities.${v}`)}
                onChange={(quality) => set({ quality: Number(quality) as 1 | 2 | 3 })}
              />
            </Row>
          </fieldset>

          {progress && (
            <div className="space-y-1.5" role="status">
              <div
                className="h-2 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-label={t('export.title')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${Math.max(4, percent)}%` }}
                />
              </div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
                {progress.total > 1 && progress.done < progress.total
                  ? t('export.page', {
                      current: Math.min(progress.done + 1, progress.total),
                      total: progress.total,
                    })
                  : progress.done >= progress.total && progress.done > 0
                    ? t('export.finishing')
                    : t('export.preparing')}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {busy ? (
              <Button
                variant="outline"
                className="h-11"
                onClick={() => controller.current?.abort()}
              >
                {t('common.cancel')}
              </Button>
            ) : (
              <Button className="h-11" onClick={start}>
                {t('export.save')}
              </Button>
            )}
          </DialogFooter>

          <Separator />
          <div className="space-y-2">
            {options.view === 'list' && (
              <Button
                variant="outline"
                className="h-11 w-full justify-start"
                disabled={busy}
                onClick={() => setPrinting(true)}
              >
                <PrinterIcon aria-hidden /> {t('export.print')}
              </Button>
            )}
            <Button
              variant="outline"
              className="h-11 w-full justify-start"
              disabled={busy}
              onClick={() => void backup()}
            >
              <DatabaseBackupIcon aria-hidden /> {t('export.backup')}
            </Button>
            <p className="text-sm text-muted-foreground">{t('export.backupHint')}</p>
          </div>
        </DialogContent>
      </Dialog>

      {running && Scene && (
        <ExportStage>
          <Scene
            key={locale}
            options={running.options}
            title={running.title}
            subtitle={running.subtitle}
            onReady={(scene) => void onReady(scene)}
          />
        </ExportStage>
      )}
      {printing && <PrintList title={options.title.trim() || tree.name} onDone={stopPrinting} />}
    </>
  );
}

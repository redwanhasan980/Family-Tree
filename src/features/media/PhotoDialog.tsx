'use client';

import {
  CameraIcon,
  ImageIcon,
  LoaderCircleIcon,
  RotateCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { setPersonPhoto } from '@/features/editor/commands';
import { useEditor } from '@/features/editor/EditorProvider';
import { useIssueText } from '@/features/editor/useIssueText';
import { useOnline } from '@/features/editor/useTreeSession';
import { useUndoToast } from '@/features/editor/useUndoToast';
import { FORM_DIALOG } from '@/features/person/AddRelativeDialog';
import { ACCEPTED_IMAGE_TYPES } from '@/lib/domain/media';
import type { ShownName } from '@/lib/domain/names';
import type { Person } from '@/lib/domain/types';
import { ApiError } from '@/lib/repositories/api';
import { cn } from '@/lib/utils';
import { useTree } from '@/stores/treeStore';

import { Avatar } from './Avatar';
import { cropToBlob, loadImage, PhotoFileError, type CropArea } from './cropImage';
import { UploadError, uploadPhoto } from './upload';

type Problem = 'tooBig' | 'notImage' | 'uploadFailed' | 'unavailable' | 'offline';

type Step =
  | { kind: 'pick'; problem?: Problem }
  | { kind: 'crop'; image: HTMLImageElement; url: string }
  | { kind: 'upload'; blob: Blob; progress: number; problem?: Problem };

function subscribeCoarse(onChange: () => void) {
  const query = window.matchMedia('(pointer: coarse)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Phones and tablets: offer the camera as well as the gallery. */
function useTouchDevice(): boolean {
  return useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia('(pointer: coarse)').matches,
    () => false,
  );
}

function ProblemText({ problem }: { problem: Problem | undefined }) {
  const t = useTranslations('media');
  if (!problem) return null;
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> {t(problem)}
    </p>
  );
}

function PickStep({
  person,
  name,
  problem,
  onFile,
  onRemove,
}: {
  person: Person;
  name: ShownName;
  problem?: Problem;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('media');
  const online = useOnline();
  const touch = useTouchDevice();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const take = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFile(file);
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          'flex flex-col items-center gap-3 rounded-xl border border-dashed p-5 text-center transition-colors',
          dragging && 'border-primary bg-primary/5',
        )}
        onDragOver={(event) => {
          if (!online) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (online && file) onFile(file);
        }}
      >
        <Avatar name={name} photo={person.photo} size="lg" />
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          {touch && (
            <Button className="h-11" disabled={!online} onClick={() => camera.current?.click()}>
              <CameraIcon aria-hidden /> {t('takePhoto')}
            </Button>
          )}
          <Button
            variant={touch ? 'outline' : 'default'}
            className="h-11"
            disabled={!online}
            onClick={() => gallery.current?.click()}
          >
            <ImageIcon aria-hidden /> {t('choosePhoto')}
          </Button>
        </div>
        {!touch && <p className="text-sm text-muted-foreground">{t('dropHint')}</p>}
        <p className="text-xs text-muted-foreground">{t('formats')}</p>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={take}
        />
        <input
          ref={gallery}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="sr-only"
          tabIndex={-1}
          aria-label={t('choosePhoto')}
          data-testid="photo-file"
          onChange={take}
        />
      </div>
      <ProblemText problem={online ? problem : 'offline'} />
      {person.photo && (
        <Button
          variant="ghost"
          className="h-11 w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2Icon aria-hidden /> {t('removePhoto')}
        </Button>
      )}
    </div>
  );
}

function CropStep({
  url,
  onBack,
  onDone,
}: {
  url: string;
  onBack: () => void;
  onDone: (area: CropArea, rotation: number) => void;
}) {
  const t = useTranslations('media');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const area = useRef<Area | null>(null);
  return (
    <div className="space-y-4">
      <div className="relative h-72 w-full overflow-hidden rounded-xl bg-black sm:h-80">
        <Cropper
          image={url}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, pixels) => {
            area.current = pixels;
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground">{t('cropHint')}</p>
      <div className="flex items-center gap-3">
        <label className="flex flex-1 items-center gap-3 text-sm">
          <span className="shrink-0">{t('zoom')}</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="h-11 w-full accent-primary"
          />
        </label>
        <Button
          variant="outline"
          className="h-11"
          onClick={() => setRotation((r) => (r + 90) % 360)}
        >
          <RotateCwIcon aria-hidden /> {t('rotate')}
        </Button>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="h-11 flex-1" onClick={onBack}>
          {t('back')}
        </Button>
        <Button
          className="h-11 flex-1"
          onClick={() => area.current && onDone(area.current, rotation)}
        >
          {t('usePhoto')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Adding, replacing or removing a person's photo (P5-04, MED-01..06): pick from the
 * camera, the gallery or a drop, crop it square with zoom and rotation, shrink it to
 * 1600 px, upload it with progress, then save it as an undoable change.
 */
export function PhotoDialog({
  person,
  name,
  open,
  onOpenChange,
}: {
  person: Person;
  name: ShownName;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const editor = useEditor();
  const issueText = useIssueText();
  const undoToast = useUndoToast();
  const treeId = useTree((s) => s.treeId);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const upload = useRef<AbortController | null>(null);

  // A crop's object URL lives until the next step or the dialog closes.
  const cropUrl = step.kind === 'crop' ? step.url : null;
  useEffect(() => (cropUrl ? () => URL.revokeObjectURL(cropUrl) : undefined), [cropUrl]);
  useEffect(() => () => upload.current?.abort(), []);

  const close = () => {
    upload.current?.abort();
    setStep({ kind: 'pick' });
    onOpenChange(false);
  };

  const pick = async (file: File) => {
    try {
      setStep({ kind: 'crop', ...(await loadImage(file)) });
    } catch (error) {
      setStep({ kind: 'pick', problem: error instanceof PhotoFileError ? error.code : 'notImage' });
    }
  };

  const send = async (blob: Blob) => {
    if (!treeId) return;
    const controller = new AbortController();
    upload.current = controller;
    setStep({ kind: 'upload', blob, progress: 0 });
    try {
      const photo = await uploadPhoto(treeId, person.id, blob, {
        signal: controller.signal,
        onProgress: (progress) => setStep({ kind: 'upload', blob, progress }),
      });
      const result = editor.run((ctx) => setPersonPhoto(ctx, person.id, photo));
      if (!result.ok) {
        toast.error(issueText(result.issues[0]!));
        setStep({ kind: 'upload', blob, progress: 0, problem: 'uploadFailed' });
        return;
      }
      toast.success(t('media.saved'));
      close();
    } catch (error) {
      if (error instanceof UploadError && error.code === 'aborted') return;
      const problem: Problem =
        error instanceof ApiError && error.code === 'unavailable' ? 'unavailable' : 'uploadFailed';
      setStep({ kind: 'upload', blob, progress: 0, problem });
    } finally {
      if (upload.current === controller) upload.current = null;
    }
  };

  const crop = async (area: CropArea, rotation: number) => {
    if (step.kind !== 'crop') return;
    try {
      await send(await cropToBlob(step.image, area, rotation));
    } catch {
      setStep({ kind: 'pick', problem: 'notImage' });
    }
  };

  const remove = () => {
    const result = editor.run((ctx) => setPersonPhoto(ctx, person.id, null));
    if (!result.ok) return;
    close();
    undoToast(t('media.removed'));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className={FORM_DIALOG}>
        <DialogHeader>
          <DialogTitle>
            {step.kind === 'crop' ? t('media.cropTitle') : t('media.title', { name: name.text })}
          </DialogTitle>
          <DialogDescription className="sr-only">{t('media.formats')}</DialogDescription>
        </DialogHeader>
        {step.kind === 'pick' && (
          <PickStep
            person={person}
            name={name}
            problem={step.problem}
            onFile={(file) => void pick(file)}
            onRemove={remove}
          />
        )}
        {step.kind === 'crop' && (
          <CropStep
            url={step.url}
            onBack={() => setStep({ kind: 'pick' })}
            onDone={(area, rotation) => void crop(area, rotation)}
          />
        )}
        {step.kind === 'upload' && (
          <div className="space-y-4" aria-live="polite">
            {step.problem ? (
              <>
                <ProblemText problem={step.problem} />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-11 flex-1"
                    onClick={() => setStep({ kind: 'pick' })}
                  >
                    {t('media.back')}
                  </Button>
                  {step.problem !== 'unavailable' && (
                    <Button className="h-11 flex-1" onClick={() => void send(step.blob)}>
                      {t('common.retry')}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 font-medium">
                  <LoaderCircleIcon className="size-5 animate-spin" aria-hidden />
                  {t('media.uploading', { percent: step.progress })}
                </p>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(step.progress * 100)}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${Math.round(step.progress * 100)}%` }}
                  />
                </div>
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => {
                    upload.current?.abort();
                    setStep({ kind: 'pick' });
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

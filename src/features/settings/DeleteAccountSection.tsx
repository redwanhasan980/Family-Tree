'use client';

import { Trash2Icon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
import { FormError, FormField, PasswordField } from '@/features/auth/FormField';
import { useSession } from '@/features/auth/SessionProvider';
import { useApiErrorText, useAuthErrorText } from '@/features/auth/useMessages';
import { useRouter } from '@/i18n/navigation';
import { ApiError } from '@/lib/repositories/api';

import { deleteMyAccount } from './accountActions';

const sameEmail = (typed: string, email: string) =>
  typed.trim().toLowerCase() === email.trim().toLowerCase();

/**
 * "Delete my account" for registered users (AUTH-12: typed email, then password or
 * Google) and "Delete my guest data" for guests (AUTH-10). Both delete on the server.
 */
export function DeleteAccountSection() {
  const t = useTranslations();
  const router = useRouter();
  const { session, markClosing, releaseSession, requireSession } = useSession();
  const apiErrorText = useApiErrorText();
  const authErrorText = useAuthErrorText();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status !== 'registered' && session.status !== 'guest') return null;
  const guest = session.status === 'guest';
  const { user } = session;
  const usesPassword = user.providerIds.includes('password');
  const ns = guest ? 'deleteGuest' : 'deleteAccount';
  const confirmed = guest || (Boolean(user.email) && sameEmail(email, user.email ?? ''));

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setEmail('');
      setPassword('');
      setError(null);
    }
    setOpen(next);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    markClosing(user.uid);
    // A registered user leaves the app; a guest stays and gets a fresh, empty guest.
    if (!guest) releaseSession();
    try {
      await deleteMyAccount({ guest, password: usesPassword ? password : undefined });
      toast.success(t(`${ns}.done`));
      setBusy(false);
      setOpen(false);
      if (!guest) router.replace('/');
    } catch (failure) {
      markClosing(null);
      requireSession();
      setBusy(false);
      setError(failure instanceof ApiError ? apiErrorText(failure) : authErrorText(failure));
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-destructive/40 p-4">
      <div className="space-y-1">
        <h3 className="font-semibold">{t(`${ns}.section`)}</h3>
        <p className="text-sm text-muted-foreground">{t(`${ns}.sectionBody`)}</p>
      </div>
      <Button variant="destructive" className="h-11" onClick={() => setOpen(true)}>
        <Trash2Icon aria-hidden /> {t(`${ns}.button`)}
      </Button>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t(`${ns}.title`)}</DialogTitle>
            <DialogDescription>{t(`${ns}.body`)}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void onSubmit(event)} noValidate className="space-y-5">
            {!guest && (
              <>
                <FormField
                  label={t('deleteAccount.emailLabel')}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder={user.email ?? ''}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                {usesPassword ? (
                  <PasswordField
                    label={t('deleteAccount.passwordLabel')}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t('deleteAccount.googleHint')}</p>
                )}
              </>
            )}
            <FormError message={error} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={busy}
                onClick={() => close(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                className="h-11"
                disabled={!confirmed || (usesPassword && !guest && !password) || busy}
              >
                {busy ? t('deleteAccount.deleting') : t(`${ns}.submit`)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

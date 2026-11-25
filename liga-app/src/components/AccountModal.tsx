import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { useLeague } from '../lib/league';
import { Btn, Modal } from './ui';

export default function AccountModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const { user, store, signOut, toast } = useLeague();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const change = async () => {
    if (pw.length < 8) return toast('Passwort muss mindestens 8 Zeichen haben', 'error');
    if (pw !== pw2) return toast('Passwörter stimmen nicht überein', 'error');
    setBusy(true);
    const err = await store.auth!.changePassword(pw);
    setBusy(false);
    if (err) return toast(err, 'error');
    toast('Passwort geändert');
    setPw('');
    setPw2('');
    onClose();
  };

  const input = 'w-full rounded-xl border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-accent/60';
  return (
    <Modal open={open} onClose={onClose} title="Mein Konto">
      <div className="flex flex-col gap-5 p-5">
        <div className="text-sm text-muted">
          Angemeldet als <span className="font-semibold text-white">{user}</span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound size={16} /> Passwort ändern
          </div>
          <input id="acc-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Neues Passwort (mind. 8 Zeichen)" className={input} />
          <input id="acc-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Neues Passwort wiederholen" className={input} />
          <Btn onClick={change} disabled={busy || !pw || !pw2}>
            Passwort speichern
          </Btn>
        </div>
        <Btn
          variant="danger"
          onClick={() => {
            onClose();
            signOut();
          }}
        >
          <LogOut size={16} /> Abmelden
        </Btn>
      </div>
    </Modal>
  );
}

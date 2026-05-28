import { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import type { Pantry, Member, StorageSpace } from '../../lib/types.js';
import { Button } from '../ui/Button.js';
import { Input } from '../ui/Input.js';
import { Modal } from '../ui/Modal.js';
import { Spinner } from '../ui/Spinner.js';
import { showToast } from '../ui/Toast.js';

interface Props {
  pantryId: number;
  pantry: Pantry;
  onPantryUpdate: (p: Pantry) => void;
}

const SPACE_ICONS = ['🧊', '🥶', '🍳', '🥫', '🍷', '🧴', '🏠', '🚗'];

export function SettingsTab({ pantryId, pantry, onPantryUpdate }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [spaces, setSpaces] = useState<StorageSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(pantry.display_name);
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteType, setInviteType] = useState<'code' | 'link'>('link');
  const [spaceModal, setSpaceModal] = useState(false);
  const [spaceName, setSpaceName] = useState('');
  const [spaceIcon, setSpaceIcon] = useState('🥫');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const isOwner = pantry.role === 'owner';

  useEffect(() => {
    Promise.all([api.getMembers(pantryId), api.getSpaces(pantryId)])
      .then(([m, s]) => { setMembers(m); setSpaces(s); })
      .catch(() => showToast('Failed to load settings', 'error'))
      .finally(() => setLoading(false));
  }, [pantryId]);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    try {
      const updated = await api.updatePantry(pantryId, { display_name: displayName });
      onPantryUpdate(updated);
      showToast('Name updated', 'success');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleCreateInvite() {
    try {
      const { token, type } = await api.createInvite(pantryId, { type: inviteType });
      setInviteToken(type === 'link' ? `${window.location.origin}/join?token=${token}` : token);
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleAddSpace(e: React.FormEvent) {
    e.preventDefault();
    try {
      const space = await api.createSpace(pantryId, { name: spaceName, icon: spaceIcon });
      setSpaces(prev => [...prev, space]);
      setSpaceModal(false); setSpaceName('');
      showToast('Space added', 'success');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleDeleteSpace(space: StorageSpace) {
    try {
      await api.deleteSpace(pantryId, space.id);
      setSpaces(prev => prev.filter(s => s.id !== space.id));
      showToast('Space deleted', 'success');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleRemoveMember(m: Member) {
    try {
      await api.removeMember(pantryId, m.user_id);
      setMembers(prev => prev.filter(x => x.user_id !== m.user_id));
      showToast('Member removed', 'success');
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  async function handleDeletePantry() {
    try {
      await api.deletePantry(pantryId);
      window.location.href = '/pantries';
    } catch (err: any) { showToast(err.message, 'error'); }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="px-4 py-4 space-y-6 pb-4">
      {isOwner && (
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Pantry Name</h3>
          <form onSubmit={saveName} className="flex gap-2">
            <Input className="flex-1" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            <Button type="submit" disabled={displayName === pantry.display_name}>Save</Button>
          </form>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Members</h3>
          {isOwner && <Button variant="secondary" onClick={() => setInviteModal(true)} className="text-sm px-3 py-1.5">Invite</Button>}
        </div>
        <ul className="space-y-2">
          {members.map(m => (
            <li key={m.user_id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5">
              {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full" /> : <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-xs font-medium text-green-700">{m.name[0]}</div>}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{m.name}</div>
                <div className="text-xs text-gray-400">{m.role}</div>
              </div>
              {isOwner && m.role !== 'owner' && (
                <button onClick={() => handleRemoveMember(m)} className="text-gray-300 hover:text-red-500 text-sm min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Storage Spaces</h3>
          {isOwner && <Button variant="secondary" onClick={() => setSpaceModal(true)} className="text-sm px-3 py-1.5">+ Add</Button>}
        </div>
        <ul className="space-y-2">
          {spaces.map(s => (
            <li key={s.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5 min-h-[44px]">
              <span>{s.icon}</span>
              <span className="flex-1 text-sm">{s.name}</span>
              {isOwner && <button onClick={() => handleDeleteSpace(s)} className="text-gray-300 hover:text-red-500 text-sm min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>}
            </li>
          ))}
          {spaces.length === 0 && <p className="text-sm text-gray-400">No spaces yet</p>}
        </ul>
      </section>

      {isOwner && (
        <section>
          <h3 className="text-sm font-semibold text-red-500 uppercase tracking-wide mb-3">Danger Zone</h3>
          <Button variant="danger" onClick={() => setDeleteConfirm(true)} className="w-full">Delete Pantry</Button>
        </section>
      )}

      <Modal open={inviteModal} onClose={() => { setInviteModal(false); setInviteToken(null); }} title="Invite Member">
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setInviteType('link')} className={`flex-1 py-2 rounded-lg text-sm font-medium min-h-[44px] ${inviteType === 'link' ? 'bg-green-600 text-white' : 'border border-gray-300 text-gray-600'}`}>Link</button>
            <button onClick={() => setInviteType('code')} className={`flex-1 py-2 rounded-lg text-sm font-medium min-h-[44px] ${inviteType === 'code' ? 'bg-green-600 text-white' : 'border border-gray-300 text-gray-600'}`}>Code</button>
          </div>
          {!inviteToken ? (
            <Button className="w-full" onClick={handleCreateInvite}>Generate {inviteType === 'link' ? 'Link' : 'Code'}</Button>
          ) : (
            <div className="space-y-3">
              {inviteType === 'code' && (
                <div className="text-xs text-gray-500 text-center">
                  Share both the <strong>slug</strong> and <strong>code</strong> below:
                  <div className="mt-1 font-mono text-sm">Slug: <strong>{pantry.slug}</strong></div>
                </div>
              )}
              <div className="bg-gray-50 rounded-xl p-3 break-all text-sm font-mono text-center">{inviteToken}</div>
              <Button variant="secondary" className="w-full" onClick={() => {
                const textToCopy = inviteType === 'code' ? `Pantry: ${pantry.slug}\nCode: ${inviteToken}` : inviteToken;
                navigator.clipboard.writeText(textToCopy);
                showToast('Copied!', 'success');
              }}>Copy</Button>
              <p className="text-xs text-gray-400 text-center">Single-use. Share this with the person you want to invite.</p>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={spaceModal} onClose={() => setSpaceModal(false)} title="Add Storage Space">
        <form onSubmit={handleAddSpace} className="space-y-4">
          <Input label="Name" value={spaceName} onChange={e => setSpaceName(e.target.value)} placeholder="e.g. Fridge" required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Icon</label>
            <div className="flex flex-wrap gap-2">
              {SPACE_ICONS.map(icon => (
                <button key={icon} type="button" onClick={() => setSpaceIcon(icon)}
                  className={`text-2xl p-2 rounded-lg min-h-[44px] min-w-[44px] ${spaceIcon === icon ? 'bg-green-100 ring-2 ring-green-500' : 'hover:bg-gray-100'}`}>{icon}</button>
              ))}
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={!spaceName}>Add Space</Button>
        </form>
      </Modal>

      <Modal open={deleteConfirm} onClose={() => setDeleteConfirm(false)} title="Delete Pantry?">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">This will permanently delete <strong>{pantry.display_name}</strong> and all its data. This cannot be undone.</p>
          <p className="text-xs text-gray-400">You must remove all other members first.</p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
            <Button variant="danger" className="flex-1" onClick={handleDeletePantry}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

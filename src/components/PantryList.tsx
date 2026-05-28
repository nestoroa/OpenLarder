import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';
import type { Pantry } from '../lib/types.js';
import { Button } from './ui/Button.js';
import { Input } from './ui/Input.js';
import { showToast } from './ui/Toast.js';
import { Spinner } from './ui/Spinner.js';

export default function PantryList() {
  const [pantries, setPantries] = useState<Pantry[]>([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [joinSlug, setJoinSlug] = useState('');
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    api.getPantries().then(setPantries).catch(() => showToast('Failed to load pantries', 'error')).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const p = await api.createPantry({ slug, display_name: name });
      setPantries(prev => [...prev, p]);
      setSlug(''); setName('');
      showToast('Pantry created!', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { pantry_id } = await api.joinPantry({ slug: joinSlug, code: joinCode });
      window.location.href = `/pantry/${pantry_id}`;
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Your Pantries</h2>
        {pantries.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No pantries yet. Create one below.</p>
        )}
        <ul className="space-y-2">
          {pantries.map(p => (
            <li key={p.id}>
              <a href={`/pantry/${p.id}`}
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:border-green-400 transition-colors min-h-[44px]">
                <div>
                  <div className="font-medium">{p.display_name}</div>
                  <div className="text-xs text-gray-400">{p.slug} · {p.role}</div>
                </div>
                <span className="text-gray-400">›</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Create Pantry</h2>
        <form onSubmit={handleCreate} className="space-y-3 bg-white p-4 rounded-xl border border-gray-200">
          <Input label="Display name" value={name} onChange={e => setName(e.target.value)} placeholder="Home Kitchen" required />
          <Input label="Slug" value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} placeholder="home-kitchen" pattern="[a-z0-9-]{3,32}" required />
          <Button type="submit" className="w-full" disabled={!slug || !name}>Create</Button>
        </form>
      </section>

      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">Join Pantry</h2>
        <form onSubmit={handleJoin} className="space-y-3 bg-white p-4 rounded-xl border border-gray-200">
          <Input label="Pantry slug" value={joinSlug} onChange={e => setJoinSlug(e.target.value)} placeholder="home-kitchen" required />
          <Input label="Invite code" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="X7K2AB9F" maxLength={8} required />
          <Button type="submit" className="w-full" disabled={!joinSlug || !joinCode}>Join</Button>
        </form>
      </section>
    </div>
  );
}

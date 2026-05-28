import { useState } from 'react';
import { api } from '../lib/api.js';
import { Button } from './ui/Button.js';
import { showToast } from './ui/Toast.js';

export default function JoinConfirm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    setLoading(true);
    try {
      const { pantry_id } = await api.useInvite(token);
      window.location.href = `/pantry/${pantry_id}`;
    } catch (err: any) {
      if (err.status === 401) {
        window.location.href = `/auth/google?token=${encodeURIComponent(token)}`;
        return;
      }
      showToast(err.message, 'error');
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm text-center space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-green-700">You've been invited!</h1>
        <p className="text-gray-500 mt-2 text-sm">Click below to join this pantry.</p>
      </div>
      <Button onClick={handleJoin} loading={loading} className="w-full">
        Join Pantry
      </Button>
      <a href="/pantries" className="block text-sm text-gray-400 hover:text-gray-600">Cancel</a>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../lib/api.js';
import type { PantryEvent } from '../../lib/types.js';
import { Spinner } from '../ui/Spinner.js';
import { showToast } from '../ui/Toast.js';

function eventDescription(event: PantryEvent): string {
  try {
    const p = JSON.parse(event.payload);
    switch (event.event_type) {
      case 'stock_added': return `Added ${p.product_name ?? 'item'} to ${p.storage_space ?? 'stock'}`;
      case 'stock_updated': return `Updated ${p.product_name ?? 'item'}: ${p.count_before} → ${p.count_after}`;
      case 'stock_removed': return `Removed ${p.product_name ?? 'item'} from stock`;
      case 'shopping_item_added': return `Added "${p.item_name}" to shopping list`;
      case 'shopping_item_checked': return `Checked off "${p.item_name}"`;
      case 'shopping_item_removed': return `Removed "${p.item_name}" from list`;
      case 'shopping_list_cleared': return `Cleared ${p.items_cleared} checked item(s)`;
      case 'member_joined': return `${p.user_name || event.user_name} joined via ${p.invite_type}`;
      case 'member_removed': return `Removed ${p.user_name || 'a member'}`;
      case 'storage_space_added': return `Added storage space: ${p.space_name} ${p.icon}`;
      case 'storage_space_deleted': return `Deleted storage space: ${p.space_name}`;
      default: return event.event_type;
    }
  } catch { return event.event_type; }
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function ActivityTab({ pantryId }: { pantryId: number }) {
  const [events, setEvents] = useState<PantryEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offline, setOffline] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Track the last event id in a ref so the IntersectionObserver callback
  // doesn't need `events` in its dep array (which would recreate the observer on every page load)
  const lastEventIdRef = useRef<number | undefined>(undefined);

  const loadFirst = useCallback(async () => {
    try {
      const { events: e, has_more } = await api.getEvents(pantryId);
      setEvents(e);
      setHasMore(has_more);
      lastEventIdRef.current = e[e.length - 1]?.id;
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [pantryId]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore || loadingMore || offline) return;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      const before = lastEventIdRef.current;
      if (!before) return;
      setLoadingMore(true);
      try {
        const { events: more, has_more } = await api.getEvents(pantryId, before);
        setEvents(prev => [...prev, ...more]);
        setHasMore(has_more);
        lastEventIdRef.current = more[more.length - 1]?.id ?? before;
      } catch {
        showToast('No more results available offline', 'info');
        setHasMore(false);
      } finally {
        setLoadingMore(false);
      }
    }, { threshold: 1.0 });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  // Note: `events` intentionally omitted — cursor tracked via lastEventIdRef
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loadingMore, offline, pantryId]);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="px-4 py-4 space-y-2 pb-4">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Activity</h2>
      {offline && <p className="text-center text-gray-400 text-sm py-4">Showing cached events. Go online to load more.</p>}
      {events.length === 0 && !offline && <p className="text-center text-gray-400 text-sm py-8">No activity yet</p>}
      <ul className="space-y-2">
        {events.map(event => (
          <li key={event.id} className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl p-3">
            {event.avatar_url
              ? <img src={event.avatar_url} alt="" className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5" />
              : <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-medium text-green-700">{event.user_name?.[0]}</div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800">{eventDescription(event)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{event.user_name} · {timeAgo(event.created_at)}</p>
            </div>
          </li>
        ))}
      </ul>
      <div ref={sentinelRef} className="py-2 flex justify-center">
        {loadingMore && <Spinner className="w-4 h-4" />}
        {!hasMore && events.length > 0 && !offline && <p className="text-xs text-gray-300">No more events</p>}
      </div>
    </div>
  );
}

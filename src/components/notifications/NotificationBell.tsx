import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Clock, Mail, MessageSquare, StickyNote, ListChecks } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  AppNotification,
  NotificationType,
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/hooks/useNotifications';
import { NotificationSettings } from './NotificationSettings';

const ICONS: Record<NotificationType, typeof Bell> = {
  pin_assigned: StickyNote,
  pin_returned: StickyNote,
  subtask_done: Check,
  comment: MessageSquare,
  reminder: Clock,
  case_email: Mail,
  review_due: ListChecks,
  deadline: Clock,
};

const ICON_TONE: Record<NotificationType, string> = {
  pin_assigned: 'bg-[#FFF4E3] text-[#8a6417]',
  pin_returned: 'bg-[#FFF4E3] text-[#8a6417]',
  subtask_done: 'bg-[#EDF2E6] text-[#4e6b3c]',
  comment: 'bg-[#F0EEF6] text-[#5f5486]',
  reminder: 'bg-[#FFF7ED] text-[#b4692b]',
  case_email: 'bg-muted text-muted-foreground',
  review_due: 'bg-muted text-muted-foreground',
  deadline: 'bg-[#FBEAE5] text-[#B4472B]',
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Minuten`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} ${h === 1 ? 'Stunde' : 'Stunden'}`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'gestern';
  if (d < 7) return `vor ${d} Tagen`;
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'unread' | 'all'>('unread');
  // Die Einstellungen liegen in derselben Klappe, eine Ebene dahinter.
  const [zeigeEinstellungen, setZeigeEinstellungen] = useState(false);
  const navigate = useNavigate();

  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();

  const unread = notifications.filter(n => !n.read_at);
  const shown = tab === 'unread' ? unread : notifications;

  const handleClick = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.url) {
      setOpen(false);
      navigate(n.url);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (!o) setZeigeEinstellungen(false);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={unread.length ? `${unread.length} ungelesene Benachrichtigungen` : 'Benachrichtigungen'}
        >
          <Bell className="h-[18px] w-[18px]" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#C0392B] px-1 text-[10px] font-semibold text-white">
              {unread.length > 99 ? '99+' : unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[404px] p-0">
        {zeigeEinstellungen ? (
          <NotificationSettings onBack={() => setZeigeEinstellungen(false)} />
        ) : (
        <>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-[14.5px] font-semibold">Benachrichtigungen</span>
          {unread.length > 0 && (
            <button
              type="button"
              onClick={() => markAll.mutate()}
              className="text-[12.5px] text-primary hover:underline"
            >
              Alle gelesen
            </button>
          )}
        </div>

        <div className="flex gap-1.5 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setTab('unread')}
            className={`rounded-full px-2.5 py-1 text-[12px] ${
              tab === 'unread' ? 'bg-[#2B2B2B] text-white' : 'border border-border text-foreground'
            }`}
          >
            Ungelesen · {unread.length}
          </button>
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`rounded-full px-2.5 py-1 text-[12px] ${
              tab === 'all' ? 'bg-[#2B2B2B] text-white' : 'border border-border text-foreground'
            }`}
          >
            Alle
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {shown.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
              {tab === 'unread' ? 'Nichts Ungelesenes.' : 'Noch keine Benachrichtigungen.'}
            </p>
          )}

          {shown.map(n => {
            const Icon = ICONS[n.type] || Bell;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => handleClick(n)}
                className={`flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-muted/60 ${
                  n.read_at ? '' : 'bg-[#FFFBF3]'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full ${ICON_TONE[n.type] || 'bg-muted'}`}
                >
                  <Icon className="h-[15px] w-[15px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-snug text-foreground">{n.title}</span>
                  {n.body && (
                    <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">{n.body}</span>
                  )}
                  <span className="mt-1 block text-[11.5px] text-muted-foreground">
                    {relativeTime(n.created_at)}
                  </span>
                </span>
                {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>

        <div className="border-t border-border px-4 py-2.5 text-center">
          <button
            type="button"
            onClick={() => setZeigeEinstellungen(true)}
            className="text-[12.5px] text-muted-foreground hover:text-foreground hover:underline"
          >
            Einstellungen für Benachrichtigungen
          </button>
        </div>
        </>
        )}
      </PopoverContent>
    </Popover>
  );
}

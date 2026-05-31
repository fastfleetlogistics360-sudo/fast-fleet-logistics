"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Loader2, Megaphone, WalletCards, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type NotificationType = "order_update" | "payment" | "system" | "promotion" | string;

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: NotificationType;
  read?: boolean | null;
  read_at?: string | null;
  created_at: string;
};

function isUnread(notification: NotificationRow) {
  return notification.read === false || (!notification.read && !notification.read_at);
}

function iconFor(type: NotificationType) {
  if (type === "payment") return WalletCards;
  if (type === "promotion") return Megaphone;
  return Bell;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const unreadCount = useMemo(() => notifications.filter(isUnread).length, [notifications]);

  useEffect(() => {
    let mounted = true;
    let removeChannel: (() => void) | undefined;

    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) {
          setNotifications([]);
          return;
        }

        const { data } = await supabase
          .from("notifications")
          .select("id, user_id, title, body, type, read, read_at, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30);

        if (mounted) setNotifications((data || []) as NotificationRow[]);

        const channel = supabase
          .channel(`notifications:${user.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
            () => {
              void load();
            }
          )
          .subscribe();

        removeChannel = () => {
          supabase.removeChannel(channel);
        };
      } catch {
        if (mounted) setNotifications([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
      removeChannel?.();
    };
  }, []);

  async function markRead(id: string) {
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, read: true, read_at: new Date().toISOString() } : item)));
    try {
      const supabase = createClient();
      await supabase.from("notifications").update({ read: true, read_at: new Date().toISOString() }).eq("id", id);
    } catch {
      // Optimistic UI keeps the panel responsive in preview mode.
    }
  }

  async function handleNotificationClick(notification: NotificationRow) {
    await markRead(notification.id);
    if (notification.type !== "business_order_received") return;
    setOpen(false);
    window.requestAnimationFrame(() => {
      document.getElementById("marketplace-orders")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function markAllRead() {
    const ids = notifications.filter(isUnread).map((item) => item.id);
    setNotifications((current) => current.map((item) => ({ ...item, read: true, read_at: item.read_at || new Date().toISOString() })));
    try {
      const supabase = createClient();
      await supabase.from("notifications").update({ read: true, read_at: new Date().toISOString() }).in("id", ids);
    } catch {
      // Optimistic UI keeps the panel responsive in preview mode.
    }
  }

  return (
    <>
      <button
        type="button"
        className="relative inline-grid h-11 w-11 place-items-center rounded-fleet border border-fleet-line bg-white text-fleet-night shadow-[0_10px_24px_rgba(8,17,31,0.06)]"
        aria-label="Open notifications"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-fleet-ember px-1 text-[0.65rem] font-black text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[120] bg-fleet-night/35" role="dialog" aria-modal="true">
          <aside className="ml-auto grid h-full w-full max-w-md grid-rows-[auto_1fr] bg-white shadow-glow">
            <div className="flex items-center justify-between gap-3 border-b border-fleet-line p-4">
              <div>
                <h2 className="text-xl font-black text-fleet-night">Notifications</h2>
                <p className="text-xs font-bold text-slate-500">{unreadCount} unread</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={!unreadCount} onClick={markAllRead}>
                  <CheckCheck className="h-4 w-4" />
                  Read all
                </Button>
                <button type="button" aria-label="Close notifications" className="grid h-10 w-10 place-items-center rounded-fleet bg-fleet-paper text-fleet-night" onClick={() => setOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-4">
              {loading ? (
                <div className="grid gap-3">
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </div>
              ) : notifications.length ? (
                <div className="grid gap-3">
                  {notifications.map((notification) => {
                    const Icon = iconFor(notification.type);
                    const unread = isUnread(notification);
                    return (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => void handleNotificationClick(notification)}
                        className={cn(
                          "flex gap-3 rounded-fleet border p-3 text-left transition hover:border-fleet-gold",
                          unread ? "border-fleet-navy bg-sky-50" : "border-fleet-line bg-white"
                        )}
                      >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-fleet bg-white text-fleet-navy">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span>
                          <strong className="block text-sm font-black text-fleet-night">{notification.title}</strong>
                          <span className="mt-1 block text-xs font-semibold leading-5 text-slate-600">{notification.body}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid min-h-80 place-items-center rounded-fleet border border-dashed border-fleet-line bg-fleet-paper p-6 text-center">
                  <div>
                    <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white text-fleet-navy shadow-lift">
                      <Bell className="h-7 w-7" />
                    </span>
                    <h3 className="mt-4 text-lg font-black text-fleet-night">No notifications yet</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Delivery, payment, and system updates will appear here.</p>
                  </div>
                </div>
              )}
              {loading ? (
                <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading notifications
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

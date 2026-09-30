import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowUp, ChevronLeft, MessageSquare, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTitle } from "../lib/hooks";
import { STATUS_LABEL, dateRange, fromDay, timeAgo } from "../lib/format";
import type { Conversation, Message } from "../lib/types";
import { Avatar, EmptyState, Img, PageLoader, Spinner } from "../components/ui";
import { RequireAuth } from "./Trips";

function ConversationList({ activeId }: { activeId?: number }) {
  const [filter, setFilter] = useState<"all" | "guest" | "host">("all");
  const { data, isLoading } = useQuery({ queryKey: ["conversations"], queryFn: () => api.get<{ conversations: Conversation[] }>("/conversations"), refetchInterval: 15_000 });
  const list = (data?.conversations || []).filter((c) => filter === "all" || (filter === "host" ? c.role === "host" : c.role === "guest"));
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-4 pt-6">
        <h1 className="text-[26px] font-semibold">Messages</h1>
        <div className="mt-4 flex gap-2">
          {(
            [
              ["all", "All"],
              ["guest", "Traveling"],
              ["host", "Hosting"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={clsx("rounded-full px-4 py-2 text-sm font-medium transition", filter === k ? "bg-ink text-white" : "bg-ink-bg hover:bg-ink-faint")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-ink-muted">
            <MessageSquare className="mx-auto mb-3 h-8 w-8" strokeWidth={1.4} />
            No messages yet. When you contact a host or book a stay, your conversation will appear here.
          </div>
        ) : (
          list.map((c) => (
            <Link key={c.id} to={`/messages/${c.id}`} className={clsx("flex gap-3 rounded-xl p-3 transition", activeId === c.id ? "bg-ink-bg" : "hover:bg-ink-bg/60")}>
              <div className="relative shrink-0">
                <Img src={c.listing.photo} alt="" seed={c.listing.id} className="h-12 w-12 rounded-lg" />
                <Avatar src={c.other.avatarUrl} name={c.other.firstName} size={28} className="absolute -bottom-1.5 -right-1.5 border-2 border-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className={clsx("truncate", c.unread ? "font-bold" : "font-medium")}>{c.other.firstName}</span>
                  <span className="shrink-0 text-xs text-ink-muted">{c.lastMessage ? timeAgo(c.lastMessage.createdAt) : ""}</span>
                </div>
                <p className={clsx("truncate text-sm", c.unread ? "font-semibold text-ink" : "text-ink-muted")}>
                  {c.lastMessage ? `${c.lastMessage.mine ? "You: " : ""}${c.lastMessage.body}` : "…"}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {c.booking ? `${STATUS_LABEL[c.booking.status]?.label} · ${dateRange(fromDay(c.booking.check_in), fromDay(c.booking.check_out))}` : "Inquiry"} · {c.listing.city}
                </p>
              </div>
              {c.unread > 0 && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function Thread({ id }: { id: number }) {
  const { refresh } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.get<{ conversation: Conversation; messages: Message[] }>(`/conversations/${id}`),
    refetchInterval: 8_000,
  });
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
    if (data) {
      refresh();
      qc.invalidateQueries({ queryKey: ["conversations"] });
    }
  }, [data?.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await api.post(`/conversations/${id}/messages`, { body });
      setBody("");
      qc.invalidateQueries({ queryKey: ["conversation", id] });
    } finally {
      setSending(false);
    }
  };

  if (isLoading || !data) return <PageLoader />;
  const { conversation: c, messages } = data;
  const tripLink = c.booking ? (c.role === "host" ? `/hosting/reservations/${c.booking.id}` : `/trips/${c.booking.id}`) : `/rooms/${c.listing.id}`;

  let lastDate = "";
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-ink-faint px-5 py-4">
        <button type="button" onClick={() => navigate("/messages")} className="rounded-full p-1.5 hover:bg-ink-bg lg:hidden" aria-label="Back">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <Avatar src={c.other.avatarUrl} name={c.other.firstName} size={40} />
        <div className="min-w-0 flex-1">
          <Link to={`/users/${c.other.id}`} className="font-semibold hover:underline">
            {c.other.name}
          </Link>
          <Link to={tripLink} className="block truncate text-sm text-ink-muted hover:underline">
            {c.listing.title}
            {c.booking ? ` · ${dateRange(fromDay(c.booking.check_in), fromDay(c.booking.check_out))}` : ""}
          </Link>
        </div>
        {c.booking && (
          <Link to={tripLink} className="hidden rounded-lg border border-ink-line px-4 py-2 text-sm font-semibold hover:border-ink sm:block">
            {c.role === "host" ? "Reservation" : "Trip details"}
          </Link>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-6">
        {messages.map((m) => {
          const d = new Date(`${m.createdAt.replace(" ", "T")}Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
          const showDate = d !== lastDate;
          lastDate = d;
          return (
            <div key={m.id}>
              {showDate && <div className="my-4 text-center text-xs font-semibold text-ink-muted">{d}</div>}
              {m.kind === "system" ? (
                <div className="mx-auto flex max-w-md items-start gap-2 rounded-xl bg-ink-bg px-4 py-3 text-center text-sm text-ink-soft">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  {m.body}
                </div>
              ) : (
                <div className={clsx("flex items-end gap-2", m.mine && "flex-row-reverse")}>
                  {!m.mine && <Avatar src={c.other.avatarUrl} name={c.other.firstName} size={28} />}
                  <div className={clsx("max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px]", m.mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-ink-bg")}>{m.body}</div>
                  <span className="pb-1 text-[11px] text-ink-muted">{new Date(`${m.createdAt.replace(" ", "T")}Z`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex items-end gap-2 border-t border-ink-faint p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="Type a message"
          className="max-h-40 min-h-[48px] flex-1 resize-none rounded-3xl border border-ink-line px-5 py-3 text-[15px] focus:border-ink focus:outline-none"
        />
        <button type="submit" disabled={!body.trim() || sending} aria-label="Send" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-white transition disabled:bg-ink-line">
          <ArrowUp className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}

export default function Messages() {
  const { id } = useParams();
  useTitle("Messages");
  const active = id ? Number(id) : undefined;
  return (
    <RequireAuth>
      <div className="mx-auto flex h-[calc(100vh-81px)] max-w-[2520px] pb-14 md:pb-0">
        <div className={clsx("w-full border-r border-ink-faint lg:w-[380px] lg:shrink-0", active ? "hidden lg:block" : "block")}>
          <ConversationList activeId={active} />
        </div>
        <div className={clsx("min-w-0 flex-1", active ? "block" : "hidden lg:flex lg:items-center lg:justify-center")}>
          {active ? (
            <Thread key={active} id={active} />
          ) : (
            <div className="max-w-sm">
              <EmptyState icon={<MessageSquare className="h-10 w-10" strokeWidth={1.4} />} title="Select a conversation" body="Messages with hosts and guests appear here, together with booking updates from the escrow contract." />
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}

"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, History, Loader2, MessageCircle, RefreshCw, Send, Sparkles, Trash2 } from "lucide-react";
import { FastAiMascot } from "@/components/fast-ai/fast-ai-mascot";

type ResponseKind = "knowledge_retrieval" | "tool_result" | "clarification" | "refusal";
type Message = { id: string; role: "assistant" | "user"; text: string; mode?: "generative" | "deterministic_fallback"; responseKind?: ResponseKind };
type SavedConversation = { id: string; title: string; preview: string | null; updated_at: string };
type ConversationContext = { previousIntent?: string; referencedDeliveryCode?: string | null; referencedOrderCode?: string | null };
const welcome: Message = { id: "welcome", role: "assistant", text: "Hello! 👋\n\nHow can I make your day easier?\n\nI’m FAST AI, your friendly Fast Fleets 360 assistant. I can help you with deliveries, restaurants, shopping and more." };
const prompts = [
  ["Send a package", "How can I send a package in Lagos?"],
  ["Track delivery", "How do I track a delivery?"],
  ["Order food", "How does Fast Fleets restaurant delivery work?"],
  ["Get assistance", "How can I report a delayed delivery?"]
] as const;
const storageKey = "fast-ai-customer-conversation-v1";

export function CustomerFastAi() {
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [context, setContext] = useState<ConversationContext>({});
  const lastMessage = useRef<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { const saved = JSON.parse(window.localStorage.getItem(storageKey) || "[]") as Message[]; if (Array.isArray(saved) && saved.length) setMessages(saved); } catch {}
    void refreshHistory();
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, pending]);
  useEffect(() => { try { window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-24))); } catch {} }, [messages]);

  async function refreshHistory() {
    const response = await fetch("/api/fast-ai/conversations", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json().catch(() => ({})) as { conversations?: SavedConversation[] };
    if (Array.isArray(payload.conversations)) setSavedConversations(payload.conversations);
  }

  async function openConversation(id: string) {
    const response = await fetch(`/api/fast-ai/conversations?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { conversation?: { id: string; context?: ConversationContext; messages?: Array<{ id: string; role: "user" | "assistant"; body: string; response_mode: Message["mode"] | null; response_kind: ResponseKind | null }> } };
    if (!response.ok || !payload.conversation?.messages) { setError("That saved conversation is unavailable right now."); return; }
    setConversationId(payload.conversation.id);
    setMessages(payload.conversation.messages.map(message => ({ id: message.id, role: message.role, text: message.body, mode: message.response_mode || undefined, responseKind: message.response_kind || undefined })));
    setContext(payload.conversation.context || {});
    setHistoryOpen(false); setError(null);
  }

  async function ask(value = input) {
    const message = value.trim(); if (!message || pending) return;
    lastMessage.current = message; setInput(""); setError(null); setPending(true);
    setMessages(current => [...current, { id: `u-${Date.now()}`, role: "user", text: message }]);
    try {
      const response = await fetch("/api/fast-ai/conversation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, conversationId, context }) });
      const payload = await response.json().catch(() => ({})) as { answer?: string; mode?: Message["mode"]; responseKind?: ResponseKind; context?: ConversationContext; conversationId?: string | null; historySaved?: boolean; error?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.error || "FAST AI could not answer right now.");
      setMessages(current => [...current, { id: `a-${Date.now()}`, role: "assistant", text: payload.answer!, mode: payload.mode, responseKind: payload.responseKind }]);
      if (payload.conversationId) setConversationId(payload.conversationId);
      if (payload.context) setContext(payload.context);
      if (payload.historySaved) void refreshHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Check your connection and try again."); }
    finally { setPending(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void ask(); }
  function startNew() { setMessages([welcome]); setConversationId(null); setContext({}); setError(null); setInput(""); try { window.localStorage.removeItem(storageKey); } catch {} }
  async function deleteConversation(id: string) {
    const response = await fetch(`/api/fast-ai/conversations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) { setError("That saved conversation could not be deleted right now."); return; }
    setSavedConversations(current => current.filter(item => item.id !== id));
    if (conversationId === id) startNew();
  }

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(244,126,24,.1),transparent_30%),linear-gradient(180deg,#f8fafc,#eef3f8)] pb-8 text-fleet-night"><div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 py-4 sm:px-6"><header className="flex items-center justify-between gap-3 rounded-[22px] border border-white/80 bg-white/90 p-3 shadow-[0_16px_42px_rgba(8,17,31,.08)]"><div className="flex min-w-0 items-center gap-3"><Link href="/hub" aria-label="Back to App Hub" className="grid h-10 w-10 place-items-center rounded-[14px] border border-fleet-line text-fleet-night"><ArrowLeft className="h-4 w-4" /></Link><FastAiMascot className="h-12 w-12" /><div><h1 className="text-lg font-black">FAST AI</h1><p className="text-xs font-semibold text-slate-600">Your intelligent logistics assistant</p></div></div><div className="flex gap-2"><button type="button" onClick={() => setHistoryOpen(value => !value)} className="grid h-9 w-9 place-items-center rounded-[12px] border border-fleet-line bg-white text-fleet-night" aria-label="Conversation history"><History className="h-4 w-4" /></button><button type="button" onClick={startNew} className="rounded-[14px] border border-fleet-line bg-white px-3 py-2 text-xs font-black text-fleet-night">New chat</button></div></header>
    {historyOpen ? <section className="mt-3 rounded-[18px] border border-white/80 bg-white p-3 shadow-[0_12px_30px_rgba(8,17,31,.08)]"><p className="px-1 text-xs font-black uppercase tracking-[.14em] text-slate-500">Saved conversations</p>{savedConversations.length ? <div className="mt-2 grid gap-1">{savedConversations.map(item => <div key={item.id} className="flex items-center gap-1 rounded-[12px] hover:bg-fleet-paper"><button type="button" onClick={() => void openConversation(item.id)} className="min-w-0 flex-1 px-3 py-2 text-left"><strong className="block truncate text-sm">{item.title}</strong><span className="block truncate text-xs font-semibold text-slate-500">{item.preview || "No messages yet"}</span></button><button type="button" onClick={() => void deleteConversation(item.id)} className="mr-2 grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${item.title}`}><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div> : <p className="px-1 py-3 text-sm font-semibold text-slate-500">Sign in and send a message to save conversations here.</p>}</section> : null}
    <section className="mt-4 flex-1 rounded-[24px] border border-white/80 bg-white/90 p-3 shadow-[0_18px_48px_rgba(8,17,31,.08)] sm:p-5" aria-live="polite"><div className="space-y-3">{messages.map(message => <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[85%] rounded-[18px] bg-fleet-night px-4 py-3 text-sm font-semibold leading-6 text-white" : "mr-auto max-w-[88%] whitespace-pre-wrap rounded-[18px] bg-[#f1f5f9] px-4 py-3 text-sm font-semibold leading-6 text-slate-700"}><p className="mb-1 text-[0.65rem] font-black uppercase tracking-[.14em] opacity-65">{message.role === "user" ? "You" : assistantLabel(message)}</p>{message.text}</div>)}{pending ? <div className="mr-auto flex items-center gap-2 rounded-[18px] bg-[#f1f5f9] px-4 py-3 text-sm font-bold text-slate-600"><Loader2 className="h-4 w-4 animate-spin text-fleet-ember" />FAST AI is thinking…</div> : null}<div ref={end} /></div>
      {messages.length === 1 ? <div className="mt-5 grid grid-cols-2 gap-2">{prompts.map(([label, question]) => <button key={label} type="button" onClick={() => void ask(question)} className="flex min-h-16 items-center gap-2 rounded-[16px] border border-fleet-line bg-white px-3 text-left text-sm font-black text-fleet-night transition hover:border-fleet-gold"><Sparkles className="h-4 w-4 shrink-0 text-fleet-ember" />{label}</button>)}</div> : null}
      {error ? <div className="mt-4 flex items-center justify-between gap-3 rounded-[16px] border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert"><span>{error}</span><button type="button" onClick={() => lastMessage.current && void ask(lastMessage.current)} className="inline-flex items-center gap-1 font-black"><RefreshCw className="h-3.5 w-3.5" />Retry</button></div> : null}
      <form onSubmit={submit} className="mt-5 flex items-end gap-2"><textarea value={input} onChange={event => setInput(event.target.value)} maxLength={1200} rows={2} placeholder="Ask about Fast Fleets 360…" className="min-h-12 flex-1 resize-none rounded-[16px] border border-fleet-line bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-fleet-ember focus:ring-4 focus:ring-fleet-gold/20" /><button disabled={pending || input.trim().length < 2} className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] bg-fleet-ember text-white shadow-[0_12px_26px_rgba(244,126,24,.25)] disabled:opacity-45" aria-label="Send message"><Send className="h-4 w-4" /></button></form><p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500"><MessageCircle className="h-3.5 w-3.5 text-fleet-ember" />FAST AI provides general guidance and cannot book, change, cancel, or pay for an order.</p></section></div></main>;
}

function assistantLabel(message: Message) {
  const source = message.mode === "generative" ? "Groq generated" : "Deterministic response";
  const kind = message.responseKind === "tool_result" ? " · Verified tool result" : message.responseKind === "knowledge_retrieval" ? " · Approved knowledge" : message.responseKind === "clarification" ? " · Clarification" : message.responseKind === "refusal" ? " · Safety response" : "";
  return `FAST AI · ${source}${kind}`;
}

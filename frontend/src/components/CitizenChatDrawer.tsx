"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, CircleStop, RotateCcw, Send, Sparkles, Trash2, X } from "lucide-react";
import { useCitizenChat } from "@/lib/useCitizenChat";
import type { ObstacleReport, TransitStop } from "@/types/monfate";
import type { PendingProposal } from "@/types/chat";

const SUGGESTIONS = [
  "Which accessible bus is arriving next?",
  "What is the crowd level?",
  "Which route should I take?",
  "I need wheelchair boarding assistance at Tamarind Square.",
];

function ProposalCard({ item, stops, onConfirm, onCancel }: {
  item: PendingProposal;
  stops: TransitStop[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const stop = stops.find((candidate) => candidate.stop_id === item.proposal.stop_id);
  const active = item.state === "pending" || item.state === "failed";
  return (
    <section className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm" aria-label="Pending action proposal">
      <p className="font-semibold text-amber-200">
        {item.proposal.action === "assistance_request" ? "Boarding assistance" : "Obstacle report"}
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-300">
        <dt className="text-slate-500">Stop</dt><dd>{stop?.name ?? item.proposal.stop_id}</dd>
        {item.proposal.action === "assistance_request" ? <>
          <dt className="text-slate-500">Need</dt><dd>{item.proposal.passenger_need}</dd>
          <dt className="text-slate-500">Bus</dt><dd>{item.proposal.bus_id ?? "Not assigned"}</dd>
        </> : <>
          <dt className="text-slate-500">Type</dt><dd>{item.proposal.obstacle_type.replaceAll("_", " ")}</dd>
          <dt className="text-slate-500">Details</dt><dd>{item.proposal.description}</dd>
        </>}
      </dl>
      {active && <p className="mt-2 text-xs font-medium text-amber-100">Nothing has been submitted yet.</p>}
      {item.error && <p role="alert" className="mt-2 text-xs text-red-300">{item.error}</p>}
      {active && <div className="mt-3 flex gap-2">
        <button type="button" onClick={onConfirm}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-bold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          {item.state === "failed" ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          {item.state === "failed" ? "Retry" : "Confirm"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          Cancel
        </button>
      </div>}
      {item.state === "submitting" && <p className="mt-2 text-xs text-slate-300">Submitting…</p>}
      {item.state === "submitted" && <p className="mt-2 text-xs font-semibold text-ok">Submitted successfully.</p>}
      {item.state === "cancelled" && <p className="mt-2 text-xs text-slate-400">Cancelled. No record was created.</p>}
    </section>
  );
}

export function CitizenChatDrawer({ stops, onObstacleCreated }: {
  stops: TransitStop[];
  onObstacleCreated: (obstacle: ObstacleReport) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const launcher = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const chat = useCitizenChat(stops, onObstacleCreated);

  useEffect(() => {
    if (!open) return;
    const panel = dialog.current;
    const launcherButton = launcher.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    focusables()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.body.style.overflow = previousOverflow;
      launcherButton?.focus();
    };
  }, [open]);

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [chat.messages, chat.proposals]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = input;
    setInput("");
    void chat.send(value);
  };
  const retryText = [...chat.messages].reverse().find((message) => message.role === "user")?.content;

  return <>
    <button ref={launcher} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-slate-950 shadow-2xl shadow-black/40 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
      <Sparkles aria-hidden className="h-5 w-5" /> Ask SampAI
    </button>

    {open && <div className="fixed inset-0 z-50 bg-black/55" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}>
      <aside ref={dialog} role="dialog" aria-modal="true" aria-labelledby="sampai-chat-title"
        aria-busy={chat.generating}
        className="absolute inset-2 flex flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(440px,100vw)] sm:rounded-none sm:border-y-0 sm:border-r-0">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-accent/15 p-2 text-accent"><Bot aria-hidden className="h-5 w-5" /></span>
            <div><h2 id="sampai-chat-title" className="font-bold text-slate-50">SampAI Assistant</h2>
              <p className="text-xs text-slate-400">Accessible transit help</p></div>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={chat.clear} aria-label="Clear chat"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><Trash2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close SampAI chat"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><X className="h-5 w-5" /></button>
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-label="Conversation history">
          {!chat.messages.length && <div className="space-y-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">
              Ask about accessible buses, ETAs, routes, crowd levels, or prepare a report. SampAI never submits anything without your Confirm button.
            </div>
            <div className="grid gap-2">{SUGGESTIONS.map((suggestion) =>
              <button key={suggestion} type="button" onClick={() => void chat.send(suggestion)}
                className="rounded-xl border border-slate-700 px-3 py-2 text-left text-xs text-slate-300 hover:border-accent/60 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                {suggestion}
              </button>)}</div>
          </div>}
          {chat.messages.map((message) => <div key={message.id}
            className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${message.role === "user" ? "ml-auto bg-accent text-slate-950" : "bg-slate-800 text-slate-100"}`}>
            {message.content || <span className="inline-flex items-center gap-2 text-slate-400"><span className="h-2 w-2 animate-livepulse rounded-full bg-accent" />Thinking…</span>}
          </div>)}
          {chat.proposals.map((item) => <ProposalCard key={item.id} item={item} stops={stops}
            onConfirm={() => void chat.confirm(item.id)} onCancel={() => chat.cancel(item.id)} />)}
          {chat.error && <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            <p>{chat.error}</p>{retryText && <button type="button" onClick={() => void chat.send(retryText)}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-red-400/50 px-3 py-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><RotateCcw className="h-3.5 w-3.5" /> Retry</button>}
          </div>}
          <div ref={end} />
        </div>

        <form onSubmit={submit} className="border-t border-slate-800 bg-slate-950 p-3">
          <label htmlFor="sampai-message" className="sr-only">Message SampAI</label>
          <div className="flex items-end gap-2">
            <textarea id="sampai-message" rows={2} maxLength={800} value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
              placeholder="Ask about your journey…"
              className="min-h-11 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
            {chat.generating ? <button type="button" onClick={chat.stop} aria-label="Stop generating"
              className="rounded-xl bg-warn p-3 text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warn"><CircleStop className="h-5 w-5" /></button>
              : <button type="submit" disabled={!input.trim()} aria-label="Send message"
                className="rounded-xl bg-accent p-3 text-slate-950 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><Send className="h-5 w-5" /></button>}
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-500">For emergencies, contact local emergency services.</p>
        </form>
        <p className="sr-only" aria-live="polite">{chat.announcement}</p>
      </aside>
    </div>}
  </>;
}

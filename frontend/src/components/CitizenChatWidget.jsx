"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { postCitizenChat } from "@/lib/api";
import styles from "./CitizenChatWidget.module.css";

const QUICK_ACTIONS = [
  "Is the ramp ready at my stop?",
  "Next accessible bus arrival?",
  "Any reported sidewalk barriers?",
];

export default function CitizenChatWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const session = useRef(null);
  const request = useRef(null);
  const input = useRef(null);
  const trigger = useRef(null);
  const history = useRef(null);

  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [messages, loading, open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  async function send(text) {
    const message = text.trim();
    if (!message || request.current) return;
    session.current ??= crypto.randomUUID();
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    setMessages((previous) => [...previous, { role: "user", text: message }]);
    setDraft("");
    setLoading(true);
    try {
      const result = await postCitizenChat(message, session.current, controller.signal);
      setMessages((previous) => [...previous, { role: "assistant", text: result.reply }]);
    } catch {
      setMessages((previous) => [...previous, {
        role: "assistant",
        text: "The transit assistant could not connect. Please try again or confirm arrival and ramp arrangements with the operator.",
      }]);
    } finally {
      clearTimeout(timer);
      request.current = null;
      setLoading(false);
    }
  }

  return (
    <aside className={styles.widget} aria-label="Transit assistant">
      {open && (
        <section id="citizen-chat" className={styles.panel} aria-labelledby="citizen-chat-title"
          onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
          <header className={styles.header}>
            <div><h2 id="citizen-chat-title">Transit assistant</h2><p>Ramps, arrivals & accessible paths</p></div>
            <button type="button" className={styles.iconButton} onClick={close} aria-label="Close transit assistant"><X aria-hidden size={20} /></button>
          </header>
          <div ref={history} className={styles.history} role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions" tabIndex={0}>
            <p className={styles.bubble}>Hello! Include your stop name and I’ll check the latest available transit information.</p>
            {messages.map((message, index) => (
              <p key={index} className={`${styles.bubble} ${message.role === "user" ? styles.user : ""}`}>
                <span className={styles.srOnly}>{message.role === "user" ? "You: " : "Assistant: "}</span>{message.text}
              </p>
            ))}
          </div>
          {loading && <div role="status" className={styles.loading}><span className={styles.skeleton} aria-hidden />Checking transit information…</div>}
          <div className={styles.chips} aria-label="Suggested questions">
            {QUICK_ACTIONS.map((text) => <button key={text} type="button" disabled={loading} onClick={() => send(text)}>{text}</button>)}
          </div>
          <form className={styles.form} onSubmit={(event) => { event.preventDefault(); send(draft); }}>
            <label htmlFor="citizen-chat-message" className={styles.srOnly}>Message the transit assistant</label>
            <input ref={input} id="citizen-chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Ask about your stop…" autoComplete="off" />
            <button type="submit" className={styles.iconButton} disabled={loading || !draft.trim()} aria-label="Send message"><Send aria-hidden size={20} /></button>
          </form>
        </section>
      )}
      <button ref={trigger} type="button" className={styles.trigger} aria-label={open ? "Close transit assistant" : "Open transit assistant"} aria-expanded={open} aria-controls="citizen-chat" onClick={() => open ? close() : setOpen(true)}>
        <MessageCircle aria-hidden size={24} /><span>Ask MonFate</span><span className={styles.dot} aria-hidden />
      </button>
    </aside>
  );
}

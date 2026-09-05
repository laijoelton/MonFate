"use client";

import { useCallback, useRef, useState } from "react";
import { openChatStream, postAssistanceRequest, postObstacle } from "@/lib/api";
import type { ObstacleReport, TransitStop } from "@/types/monfate";
import type { ChatActionProposal, CitizenChatMessage, PendingProposal } from "@/types/chat";

const id = () => crypto.randomUUID();

function parseBlock(block: string): { event: string; data: Record<string, unknown> } | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!data.length) return null;
  return { event, data: JSON.parse(data.join("\n")) as Record<string, unknown> };
}

export function useCitizenChat(
  stops: TransitStop[],
  onObstacleCreated: (obstacle: ObstacleReport) => void,
) {
  const [messages, setMessages] = useState<CitizenChatMessage[]>([]);
  const [proposals, setProposals] = useState<PendingProposal[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sessionId = useRef<string | null>(null);

  const send = useCallback(async (raw: string) => {
    const content = raw.trim();
    if (!content || generating) return;
    if (sessionId.current === null) sessionId.current = id();
    const user: CitizenChatMessage = { id: id(), role: "user", content };
    const assistantId = id();
    const history = [...messages, user].slice(-20).map(({ role, content: text }) => ({
      role,
      content: text.slice(-800),
    }));
    setMessages((current) => [...current, user, { id: assistantId, role: "assistant", content: "" }]);
    setGenerating(true);
    setError(null);
    setAnnouncement("");
    const abort = new AbortController();
    controller.current = abort;
    let completed = "";

    try {
      const body = await openChatStream(history, sessionId.current, abort.signal);
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, "\n");
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const frame = parseBlock(block);
          if (!frame) continue;
          if (frame.event === "text_delta") {
            const text = String(frame.data.text ?? "");
            completed += text;
            setMessages((current) => current.map((message) =>
              message.id === assistantId ? { ...message, content: completed } : message));
          } else if (frame.event === "action_proposal") {
            setProposals((current) => [...current, {
              id: id(), proposal: frame.data.proposal as unknown as ChatActionProposal, state: "pending",
            }]);
          } else if (frame.event === "error") {
            throw new Error(String(frame.data.message ?? "SampAI could not respond."));
          }
        }
        if (done) break;
      }
      setAnnouncement(completed.trim() ? "SampAI response complete." : "SampAI finished.");
    } catch (caught) {
      if ((caught as Error).name === "AbortError") {
        setAnnouncement("Response stopped.");
      } else {
        setError(caught instanceof Error ? caught.message : "SampAI could not respond.");
        setMessages((current) => current.filter((message) => message.id !== assistantId || message.content));
      }
    } finally {
      controller.current = null;
      setGenerating(false);
    }
  }, [generating, messages]);

  const confirm = useCallback(async (proposalId: string) => {
    const item = proposals.find((candidate) => candidate.id === proposalId);
    if (!item || !["pending", "failed"].includes(item.state)) return;
    setProposals((current) => current.map((candidate) =>
      candidate.id === proposalId ? { ...candidate, state: "submitting", error: undefined } : candidate));
    try {
      if (item.proposal.action === "assistance_request") {
        await postAssistanceRequest({ ...item.proposal, client_request_id: proposalId });
        setMessages((current) => [...current, { id: id(), role: "assistant",
          content: "Your boarding assistance request was submitted successfully." }]);
      } else {
        const stop = stops.find((candidate) => candidate.stop_id === item.proposal.stop_id);
        if (!stop) throw new Error("The selected stop is unavailable.");
        const { obstacle } = await postObstacle({
          obstacle_type: item.proposal.obstacle_type,
          location: stop.location,
          description: item.proposal.description,
          affects: item.proposal.affects,
        });
        onObstacleCreated(obstacle);
        setMessages((current) => [...current, { id: id(), role: "assistant",
          content: "Your obstacle report was submitted successfully." }]);
      }
      setProposals((current) => current.map((candidate) =>
        candidate.id === proposalId ? { ...candidate, state: "submitted" } : candidate));
    } catch {
      setProposals((current) => current.map((candidate) => candidate.id === proposalId
        ? { ...candidate, state: "failed", error: "Submission failed. Nothing was saved; try again." }
        : candidate));
    }
  }, [onObstacleCreated, proposals, stops]);

  const cancel = (proposalId: string) => setProposals((current) => current.map((candidate) =>
    candidate.id === proposalId ? { ...candidate, state: "cancelled" } : candidate));
  const clear = () => { controller.current?.abort(); setMessages([]); setProposals([]); setError(null); };

  return { messages, proposals, generating, error, announcement, send, confirm, cancel, clear,
    stop: () => controller.current?.abort() };
}

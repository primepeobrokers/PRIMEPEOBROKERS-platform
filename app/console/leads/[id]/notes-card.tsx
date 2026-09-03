"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { formatWhen } from "@/lib/console";
import { addNote } from "./actions";
import { NOTE_MAX, type NoteView } from "@/lib/console/notes";

/**
 * Internal notes on a lead, newest first.
 *
 * Append-only, and the copy says so rather than leaving the absent edit
 * button to look like an oversight. There are no update or delete policies on
 * submission_notes by design (migration 0005 section 5): the SOW asks for
 * notes "retained as a history", and a history a participant can quietly
 * rewrite is not one.
 */
export function NotesCard({
  submissionId,
  initial,
}: {
  submissionId: string;
  initial: NoteView[];
}) {
  const [notes, setNotes] = useState(initial);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed || pending) return;
    setError("");
    startTransition(async () => {
      const result = await addNote({ submissionId, body: trimmed });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      // Prepend locally so the note appears at once. The action also
      // revalidates, so a refresh shows the same list from the server.
      setNotes((n) => [result.note, ...n]);
      setBody("");
      toast.success("Note added");
    });
  };

  const over = body.length > NOTE_MAX;

  return (
    <div>
      <Textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (error) setError("");
        }}
        onKeyDown={(e) => {
          /*
            Cmd or Ctrl + Enter submits, a deliberate divergence from the
            plain-Enter pattern the auth cards use. A note is multi-line, so
            binding bare Enter to submit would send half-written notes and
            make paragraph breaks impossible: a data-loss trap.
          */
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Add a note for the team"
        aria-label="New note"
        aria-invalid={over || !!error ? true : undefined}
        rows={3}
        className="resize-y"
      />

      <div className="mt-2 flex items-center justify-between gap-4">
        <div className="text-[12.5px] text-ink-muted">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : over ? (
            <span className="text-destructive">
              {body.length.toLocaleString("en-US")} characters, over the{" "}
              {NOTE_MAX.toLocaleString("en-US")} limit.
            </span>
          ) : (
            "Notes are permanent and visible to your team."
          )}
        </div>
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={pending || !body.trim() || over}
        >
          {pending ? "Saving…" : "Add note"}
        </Button>
      </div>

      <div className="mt-5 flex flex-col" data-rows>
        {notes.length === 0 && (
          <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
            No notes yet. Anything you record here stays with the lead.
          </div>
        )}
        {notes.map((n) => (
          <div
            key={n.id}
            className="border-b border-sunken py-3.5 last:border-b-0"
          >
            {/* whitespace-pre-wrap so paragraph breaks survive. Rendered as
                text, never as markup. */}
            <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed">
              {n.body}
            </div>
            <div className="mt-1.5 font-mono text-[11.5px] text-ink-muted">
              {n.author_name} · {formatWhen(n.created_at)} UTC
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

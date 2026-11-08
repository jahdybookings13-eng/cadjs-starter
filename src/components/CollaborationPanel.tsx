import React, { useMemo, useState } from "react";
import type { BrowserSection } from "@vitekk02/cadjs";
import {
  addProjectNote,
  canRoleComment,
  canRoleEdit,
  issueShareToken,
  removeProjectNote,
  revokeShareToken,
  setProjectMember,
  type ProjectDoc,
  type ShareRole,
} from "../project/model";
import { setPeerRole } from "../project/sessionRuntime";
import { useSessionSnapshot } from "../project/useSessionSnapshot";

const ROLE_LABELS: Record<ShareRole, string> = {
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
};

const ROLE_BLURB: Record<ShareRole, string> = {
  view: "Orbit, inspect and follow activity. No edits or notes.",
  comment: "Inspect and pin notes to selected things. No geometry edits.",
  edit: "Full sketch and feature editing.",
};

const inputClass =
  "w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-gray-100 focus:outline-none focus:border-blue-500";

function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

interface CollaborationPanelProps {
  doc: ProjectDoc;
  selfId: string;
  role: ShareRole;
  selectedIds: readonly string[];
  tree: BrowserSection[];
  vrAllowed: boolean;
  onClose: () => void;
  onSave: () => void;
  onEnterVR?: () => void;
}

export function CollaborationPanel({
  doc,
  selfId,
  role,
  selectedIds,
  tree,
  vrAllowed,
  onClose,
  onSave,
  onEnterVR,
}: CollaborationPanelProps) {
  const snap = useSessionSnapshot();
  const [revision, setRevision] = useState(0);
  const [noteDraft, setNoteDraft] = useState("");
  const [linkRole, setLinkRole] = useState<ShareRole>("view");
  const [linkVr, setLinkVr] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const isOwner = doc.ownerId === selfId;
  const canComment = canRoleComment(role);
  const canEdit = canRoleEdit(role);
  const notes = doc.settings.collab.notes;
  const members = doc.settings.collab.members;
  const tokens = doc.settings.collab.tokens;
  const refresh = () => {
    setRevision((r) => r + 1);
    onSave();
  };

  const treeLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of tree) {
      for (const item of section.items) {
        map.set(item.id, item.label);
        for (const child of item.children ?? []) map.set(child.id, child.label);
      }
    }
    return map;
  }, [tree]);

  const selectedLabels = selectedIds.map(
    (id) => treeLabels.get(id) ?? shortId(id),
  );

  const changeSeatRole = (accountId: string, name: string, next: ShareRole) => {
    if (!isOwner || accountId === selfId) return;
    setProjectMember(doc, { accountId, name, role: next });
    setPeerRole(accountId, next);
    refresh();
  };

  const changeMemberRole = (
    accountId: string,
    name: string,
    next: ShareRole,
  ) => {
    if (!isOwner) return;
    setProjectMember(doc, { accountId, name, role: next });
    refresh();
  };

  const makeLink = () => {
    if (!isOwner) return;
    const { url } = issueShareToken(
      doc,
      linkRole,
      linkLabel.trim() || undefined,
      0,
      { allowVr: linkVr },
    );
    const full = absoluteUrl(url);
    setLastLink(full);
    void copy(full);
    refresh();
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      setLastLink(text);
    }
  };

  const addNote = () => {
    if (!canComment) return;
    const note = addProjectNote(doc, {
      authorId: selfId,
      authorName: snap?.self.name ?? "You",
      body: noteDraft,
      targetIds: selectedIds,
    });
    if (!note) return;
    setNoteDraft("");
    refresh();
  };

  const deleteNote = (noteId: string) => {
    if (!removeProjectNote(doc, noteId, selfId)) return;
    refresh();
  };

  const seatIds = new Set(snap?.seats.map((seat) => seat.accountId) ?? []);
  const offlineMembers = members.filter((m) => !seatIds.has(m.accountId));

  return (
    <div
      className="cad-light-panel fixed right-3 top-14 z-50 max-h-[calc(100vh-4.5rem)] w-[min(430px,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-[var(--cad-border-strong)] bg-white text-[var(--cad-text)] shadow-2xl"
      data-testid="collaboration-panel"
      data-role={role}
      data-project-id={doc.id}
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-700 bg-gray-900/98 px-3 py-2">
        <div>
          <div className="text-sm font-semibold">People & sharing</div>
          <div className="text-[11px] text-gray-400">
            {doc.name} · {ROLE_LABELS[role]}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-100"
          aria-label="Close collaboration panel"
        >
          ✕
        </button>
      </div>

      <section className="border-b border-gray-700 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            In the suit
          </h3>
          <span className="text-[10px] text-gray-500">
            {snap?.seats.length ?? 1} live
          </span>
        </div>
        <div className="space-y-2">
          {(snap?.seats ?? []).map((seat) => {
            const self = seat.accountId === selfId;
            const selected = seat.selection.map(
              (id) => treeLabels.get(id) ?? shortId(id),
            );
            return (
              <div
                key={seat.accountId}
                className="rounded border border-gray-700 bg-gray-800/80 p-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: seat.color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {seat.name}
                    {self ? " (you)" : ""}
                  </span>
                  <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[9px] uppercase text-gray-300">
                    {seat.surface}
                  </span>
                  {isOwner && !self ? (
                    <select
                      value={seat.role}
                      onChange={(e) =>
                        changeSeatRole(
                          seat.accountId,
                          seat.name,
                          e.target.value as ShareRole,
                        )
                      }
                      className="rounded border border-gray-600 bg-gray-900 px-1 py-0.5 text-[10px] text-gray-100"
                      aria-label={`Access for ${seat.name}`}
                    >
                      {(["view", "comment", "edit"] as const).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[10px] text-gray-400">
                      {ROLE_LABELS[seat.role]}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[10px] text-gray-400">
                  {selected.length
                    ? `Working on: ${selected.join(", ")}`
                    : "Looking at the project"}
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10px] text-blue-300">
                    Tree ({tree.reduce((n, s) => n + s.items.length, 0)} items,
                    shared)
                  </summary>
                  <div className="mt-1 max-h-40 overflow-y-auto border-l border-gray-700 pl-2">
                    {tree.map((section) => (
                      <div key={section.id} className="mb-1">
                        <div className="text-[10px] font-medium text-gray-300">
                          {section.label}
                        </div>
                        {section.items.map((item) => (
                          <div
                            key={item.id}
                            className={`text-[10px] ${
                              seat.selection.includes(item.id) ||
                              seat.selection.includes(item.elementId ?? "")
                                ? "text-blue-300"
                                : "text-gray-500"
                            }`}
                          >
                            {item.label}
                          </div>
                        ))}
                      </div>
                    ))}
                    {tree.length === 0 && (
                      <div className="text-[10px] text-gray-500">
                        Empty tree
                      </div>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </div>

        {offlineMembers.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[10px] uppercase text-gray-500">
              Invited
            </div>
            <div className="space-y-1">
              {offlineMembers.map((member) => (
                <div
                  key={member.accountId}
                  className="flex items-center gap-2 rounded bg-gray-800/50 px-2 py-1"
                >
                  <span className="min-w-0 flex-1 truncate text-[11px]">
                    {member.name}
                  </span>
                  {isOwner ? (
                    <select
                      value={member.role}
                      onChange={(e) =>
                        changeMemberRole(
                          member.accountId,
                          member.name,
                          e.target.value as ShareRole,
                        )
                      }
                      className="rounded border border-gray-600 bg-gray-900 px-1 py-0.5 text-[10px]"
                      aria-label={`Access for ${member.name}`}
                    >
                      {(["view", "comment", "edit"] as const).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[10px] text-gray-500">
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="border-b border-gray-700 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Share
          </h3>
          {!isOwner && (
            <span className="text-[10px] text-amber-300">
              Owner controls access
            </span>
          )}
        </div>
        <div className="text-[11px] text-gray-400">
          Links carry the permission. A viewer cannot edit the design even if
          they open the full app.
        </div>
        {isOwner && (
          <>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <label className="text-[10px] text-gray-400">
                Who is it for?
                <input
                  className={`${inputClass} mt-1`}
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  placeholder="Dave, reviewing"
                />
              </label>
              <label className="text-[10px] text-gray-400">
                Access
                <select
                  className={`${inputClass} mt-1`}
                  value={linkRole}
                  onChange={(e) => setLinkRole(e.target.value as ShareRole)}
                  aria-label="Share link permission"
                >
                  {(["view", "comment", "edit"] as const).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-300">
              <input
                type="checkbox"
                checked={linkVr}
                onChange={(e) => setLinkVr(e.target.checked)}
                aria-label="Include VR gate in share link"
              />
              Include the VR gate in this link
            </label>
            <div className="mt-1 text-[10px] text-gray-500">
              {ROLE_BLURB[linkRole]}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={makeLink}
                className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
                data-testid="share-create-link"
              >
                Create link
              </button>
              {lastLink && (
                <button
                  onClick={() => void copy(lastLink)}
                  aria-label="Copy share link"
                  className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-100 hover:bg-gray-600"
                >
                  {copied === lastLink ? "Copied" : "Copy"}
                </button>
              )}
              {vrAllowed && onEnterVR && (
                <button
                  onClick={onEnterVR}
                  className="rounded bg-violet-600 px-2 py-1 text-xs text-white hover:bg-violet-500"
                >
                  Enter VR
                </button>
              )}
            </div>
            {lastLink && (
              <input
                readOnly
                value={lastLink}
                className={`${inputClass} mt-2 text-[10px] text-gray-300`}
                aria-label="Generated share link"
                onFocus={(e) => e.target.select()}
              />
            )}
          </>
        )}

        {tokens.length > 0 && (
          <div className="mt-3 space-y-1">
            <div className="text-[10px] uppercase text-gray-500">
              Active links
            </div>
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center gap-2 rounded bg-gray-800/60 px-2 py-1 text-[10px]"
              >
                <span className="min-w-0 flex-1 truncate text-gray-300">
                  {token.label ?? "Untitled link"} · {ROLE_LABELS[token.role]}
                  {token.allowVr ? " · VR" : " · 2D"}
                </span>
                {isOwner && (
                  <button
                    onClick={() => {
                      revokeShareToken(doc, token.id);
                      refresh();
                    }}
                    className="text-red-300 hover:text-red-200"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Notes
          </h3>
          <span className="text-[10px] text-gray-500">
            {selectedIds.length
              ? `${selectedIds.length} selected`
              : "Project note"}
          </span>
        </div>
        <div className="text-[11px] text-gray-400">
          Notes are pinned to the current selection, so the next person can see
          exactly what the note is about.
        </div>
        {canComment ? (
          <div className="mt-2">
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={
                selectedIds.length
                  ? `Note on ${selectedLabels.join(", ")}`
                  : "Note on the whole project"
              }
              aria-label="New project note"
            />
            <button
              onClick={addNote}
              disabled={!noteDraft.trim()}
              className="mt-1 rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add note
            </button>
          </div>
        ) : (
          <div className="mt-2 rounded border border-gray-700 bg-gray-800/50 px-2 py-1.5 text-[11px] text-gray-500">
            This link can read notes but not add them.
          </div>
        )}

        <div className="mt-3 space-y-2">
          {notes
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((note) => (
              <div
                key={note.id}
                className="rounded border border-gray-700 bg-gray-800/70 p-2"
              >
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  <span className="font-medium text-gray-200">
                    {note.authorName}
                  </span>
                  <span>{new Date(note.createdAt).toLocaleString()}</span>
                  {(note.authorId === selfId || isOwner) && (
                    <button
                      onClick={() => deleteNote(note.id)}
                      className="ml-auto text-red-300 hover:text-red-200"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-xs text-gray-100">
                  {note.body}
                </div>
                <div className="mt-1 truncate text-[10px] text-gray-500">
                  {note.targetIds.length
                    ? note.targetIds
                        .map((id) => treeLabels.get(id) ?? shortId(id))
                        .join(", ")
                    : "Whole project"}
                </div>
              </div>
            ))}
          {notes.length === 0 && (
            <div className="text-[11px] text-gray-500">No notes yet.</div>
          )}
        </div>
      </section>

      <div className="border-t border-gray-700 px-3 py-2 text-[10px] text-gray-500">
        {canEdit ? "Editor" : canComment ? "Commenter" : "Viewer"} ·{" "}
        {doc.settings.collab.policy} · revision {revision}
      </div>
    </div>
  );
}

export default CollaborationPanel;

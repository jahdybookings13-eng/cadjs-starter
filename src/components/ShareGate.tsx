import React from "react";
import type { ShareRole } from "../project/model";

const ROLE_LABEL: Record<ShareRole, string> = {
  view: "View only",
  comment: "Can comment",
  edit: "Can edit",
};

interface ShareGateProps {
  projectName: string;
  role: ShareRole;
  vrRequested: boolean;
  vrAllowed: boolean;
  denied?: boolean;
  onContinue: () => void;
  onEnterVR?: () => void;
  onOpenProject: () => void;
}

/**
 * The landing gate for a share link. It appears before the editor is usable so
 * a link cannot silently escalate itself: the role and the VR permission come
 * from the token, not from the URL path or a checkbox in the client.
 */
export function ShareGate({
  projectName,
  role,
  vrRequested,
  vrAllowed,
  denied = false,
  onContinue,
  onEnterVR,
  onOpenProject,
}: ShareGateProps) {
  if (denied) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950 p-6 text-gray-100"
        data-testid="share-access-denied"
      >
        <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
          <h1 className="text-lg font-semibold">This link has no access</h1>
          <p className="mt-2 text-sm text-gray-400">
            The token is missing, expired or revoked. Ask the project owner for
            a fresh link.
          </p>
          <button
            onClick={onOpenProject}
            className="mt-4 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Open my project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/95 p-6 text-gray-100"
      data-testid="share-gate"
      data-role={role}
      data-vr-allowed={vrAllowed}
    >
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
          Shared project
        </div>
        <h1 className="mt-1 text-xl font-semibold">{projectName}</h1>
        <div className="mt-3 flex items-center gap-2">
          <span className="rounded bg-blue-600/20 px-2 py-1 text-xs font-medium text-blue-300">
            {ROLE_LABEL[role]}
          </span>
          <span className="text-xs text-gray-400">
            Permission comes from the link
          </span>
        </div>

        {vrRequested && (
          <div
            className={`mt-4 rounded border p-3 text-sm ${
              vrAllowed
                ? "border-violet-500/40 bg-violet-500/10 text-violet-200"
                : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            {vrAllowed
              ? "This link includes the VR gate. You can enter the same project in the headset."
              : "This link is 2D only. The owner did not grant VR access."}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={onContinue}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Continue in 2D
          </button>
          {vrRequested && vrAllowed && onEnterVR && (
            <button
              onClick={onEnterVR}
              className="rounded bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500"
              data-testid="share-enter-vr"
            >
              Enter VR
            </button>
          )}
        </div>
        <div className="mt-3 text-[11px] text-gray-500">
          {role === "edit"
            ? "You can edit geometry and leave notes."
            : role === "comment"
              ? "You can inspect the design and leave notes, but not change geometry."
              : "You can inspect and follow the design, but not edit or comment."}
        </div>
      </div>
    </div>
  );
}

export default ShareGate;

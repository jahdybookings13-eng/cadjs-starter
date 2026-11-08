import React from "react";

interface VRButtonProps {
  vrSupported: boolean;
  inVR: boolean;
  onEnterVR: () => void;
  onExitVR: () => void;
}

export const VRButton: React.FC<VRButtonProps> = ({
  vrSupported,
  inVR,
  onEnterVR,
  onExitVR,
}) => {
  // A disabled "No XR" button is not useful chrome. Hide it when the browser
  // cannot enter VR; the supported path stays a compact viewport action.
  if (!vrSupported && !inVR) return null;

  return (
    <button
      type="button"
      className={`cad-tool border shadow-sm backdrop-blur-sm ${
        inVR
          ? "border-red-400/40 bg-red-600/90 text-white hover:bg-red-500"
          : "border-violet-400/30 bg-violet-600/90 text-white hover:bg-violet-500"
      }`}
      onClick={inVR ? onExitVR : onEnterVR}
      title={inVR ? "Exit VR" : "Enter VR"}
      aria-label={inVR ? "Exit VR" : "Enter VR"}
    >
      <svg
        aria-hidden="true"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.7}
          d="M3 8.5h18v7H3v-7Zm3 0v7m12-7v7M21 12h-3M6 12H3"
        />
      </svg>
      {inVR ? "Exit VR" : "VR"}
    </button>
  );
};

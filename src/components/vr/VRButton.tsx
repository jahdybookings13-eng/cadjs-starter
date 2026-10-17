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
  return (
    <button
      className={`flex-none px-3 py-1.5 text-sm rounded font-semibold ${
        inVR
          ? "bg-red-600 hover:bg-red-500 text-white"
          : vrSupported
            ? "bg-violet-600 hover:bg-violet-500 text-white"
            : "bg-gray-600 text-gray-300"
      }`}
      onClick={vrSupported ? (inVR ? onExitVR : onEnterVR) : undefined}
      title={vrSupported ? (inVR ? "Exit VR" : "Enter VR") : "WebXR not detected"}
    >
      {inVR ? "Exit VR" : vrSupported ? "VR" : "No XR"}
    </button>
  );
};

import React, { useEffect, useRef, FC } from "react";
import { ConstraintType } from "@vitekk02/cadjs";
import { NumberInput } from "./NumberInput";

interface ConstraintOption {
  type: ConstraintType;
  label: string;
  requiresValue?: boolean;
  applicableTo: string[]; // primitive types this constraint applies to
  minPrimitives?: number; // minimum number of primitives required
  maxPrimitives?: number; // maximum number of primitives allowed
}

// Define available constraints and their applicability
const CONSTRAINT_OPTIONS: ConstraintOption[] = [
  {
    type: "horizontal",
    label: "Horizontal",
    applicableTo: ["line"],
    minPrimitives: 1,
  },
  {
    type: "vertical",
    label: "Vertical",
    applicableTo: ["line"],
    minPrimitives: 1,
  },
  {
    type: "distance",
    label: "Length",
    requiresValue: true,
    applicableTo: ["line"],
    minPrimitives: 1,
    maxPrimitives: 1,
  },
  {
    type: "distance",
    label: "Distance",
    requiresValue: true,
    applicableTo: ["point"],
    minPrimitives: 2,
    maxPrimitives: 2,
  },
  {
    type: "radius",
    label: "Radius",
    requiresValue: true,
    applicableTo: ["circle", "arc"],
    minPrimitives: 1,
    maxPrimitives: 1,
  },
  {
    type: "coincident",
    label: "Coincident",
    applicableTo: ["point"],
    minPrimitives: 2,
    maxPrimitives: 2,
  },
  {
    type: "parallel",
    label: "Parallel",
    applicableTo: ["line"],
    minPrimitives: 2,
    maxPrimitives: 2,
  },
  {
    type: "perpendicular",
    label: "Perpendicular",
    applicableTo: ["line"],
    minPrimitives: 2,
    maxPrimitives: 2,
  },
  {
    type: "equal",
    label: "Equal",
    applicableTo: ["line", "circle", "arc"],
    minPrimitives: 2,
  },
  {
    type: "tangent",
    label: "Tangent",
    applicableTo: ["line", "circle", "arc"],
    minPrimitives: 2,
    maxPrimitives: 2,
  },
  {
    type: "concentric",
    label: "Concentric",
    applicableTo: ["circle", "arc"],
    minPrimitives: 2,
    maxPrimitives: 2,
  },
];

interface SketchContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  primitiveIds: string[];
  primitiveTypes: string[];
  constraintId?: string | null;
  onClose: () => void;
  onApplyConstraint: (type: ConstraintType, value?: number) => void;
  onDeleteConstraint?: (id: string) => void;
  onToggleFixPoint?: () => void;
  onDeletePrimitive?: () => void;
  onGetCurrentValue?: (type: ConstraintType) => number | undefined;
  onValueChange?: (type: ConstraintType, value: number) => void;
  onValueCancel?: () => void;
}

const SketchContextMenu: FC<SketchContextMenuProps> = ({
  visible,
  x,
  y,
  primitiveIds,
  primitiveTypes,
  constraintId,
  onClose,
  onApplyConstraint,
  onDeleteConstraint,
  onToggleFixPoint,
  onDeletePrimitive,
  onGetCurrentValue,
  onValueChange,
  onValueCancel,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [valueInputVisible, setValueInputVisible] = React.useState(false);
  const [pendingConstraintType, setPendingConstraintType] =
    React.useState<ConstraintType | null>(null);
  const initialValueRef = useRef<number | undefined>(undefined);

  // Reset state when menu closes
  useEffect(() => {
    if (!visible) {
      setValueInputVisible(false);
      setPendingConstraintType(null);
      initialValueRef.current = undefined;
    }
  }, [visible]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        event.preventDefault();
        event.stopPropagation();
      }
    };

    // Use setTimeout to avoid immediate trigger from the right-click that opened menu
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [visible, onClose]);

  // Filter constraints based on selected primitive types
  const getApplicableConstraints = (): ConstraintOption[] => {
    const numPrimitives = primitiveIds.length;

    return CONSTRAINT_OPTIONS.filter((option) => {
      // Check primitive count
      if (option.minPrimitives && numPrimitives < option.minPrimitives)
        return false;
      if (option.maxPrimitives && numPrimitives > option.maxPrimitives)
        return false;

      // Check if all primitive types are applicable
      return primitiveTypes.every((type) => option.applicableTo.includes(type));
    });
  };

  const handleConstraintClick = (option: ConstraintOption) => {
    if (option.requiresValue) {
      setPendingConstraintType(option.type);
      initialValueRef.current = onGetCurrentValue?.(option.type);
      setValueInputVisible(true);
    } else {
      onApplyConstraint(option.type);
    }
  };

  const cancelValueInput = () => {
    onValueCancel?.();
    setValueInputVisible(false);
    setPendingConstraintType(null);
    initialValueRef.current = undefined;
  };

  if (!visible) return null;

  const applicableConstraints = getApplicableConstraints();

  // Position menu to stay within viewport
  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: `${x}px`,
    top: `${y}px`,
    zIndex: 9999,
  };

  return (
    <div
      ref={menuRef}
      className="bg-gray-800 rounded shadow-lg border border-gray-600 py-1 min-w-[160px]"
      style={menuStyle}
      onContextMenu={(e) => e.preventDefault()}
    >
      {constraintId && onDeleteConstraint ? (
        <>
          <div className="px-3 py-1 text-xs text-gray-400 border-b border-gray-700">
            Constraint
          </div>
          <button
            onClick={() => {
              onDeleteConstraint(constraintId);
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
          >
            <span>Delete Constraint</span>
          </button>
        </>
      ) : valueInputVisible && pendingConstraintType ? (
        <div className="px-3 py-2">
          <div className="text-xs text-gray-400 mb-2">
            Enter{" "}
            {pendingConstraintType === "distance"
              ? "value"
              : pendingConstraintType}
            :
          </div>
          <NumberInput
            initialValue={initialValueRef.current}
            onSubmit={(v) => onApplyConstraint(pendingConstraintType, v)}
            onCancel={cancelValueInput}
            onChange={(v) => onValueChange?.(pendingConstraintType, v)}
            expressionMode={
              pendingConstraintType === "angle" ? "angle" : "length"
            }
            showConfirmButton
            confirmButtonClassName="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          />
        </div>
      ) : (
        <>
          <div className="px-3 py-1 text-xs text-gray-400 border-b border-gray-700">
            Constraints ({primitiveIds.length} selected)
          </div>
          {onToggleFixPoint && primitiveTypes.some((t) => t === "point") && (
            <button
              onClick={() => {
                onToggleFixPoint();
                onClose();
              }}
              className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2 border-b border-gray-700"
            >
              <span>Fix/Unfix Point</span>
            </button>
          )}
          {applicableConstraints.length > 0 ? (
            applicableConstraints.map((option, index) => (
              <button
                key={`${option.type}-${option.label}-${index}`}
                onClick={() => handleConstraintClick(option)}
                aria-label={option.label}
                className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center justify-between"
              >
                <span>{option.label}</span>
                {option.requiresValue && (
                  <span className="text-xs text-gray-500">...</span>
                )}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500">
              No constraints available
            </div>
          )}
          {onDeletePrimitive && primitiveIds.length > 0 && (
            <button
              onClick={() => {
                onDeletePrimitive();
                onClose();
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center justify-between border-t border-gray-700"
            >
              <span>
                Delete
                {primitiveIds.length > 1 ? ` (${primitiveIds.length})` : ""}
              </span>
              <span className="text-xs text-gray-500">Del</span>
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default SketchContextMenu;

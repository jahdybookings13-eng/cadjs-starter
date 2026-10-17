import { C as SELECTION, E as SWEEP, S as SCENE, T as SKETCH_PLANE, _ as LIGHTING, a as debugLog, d as COMBINE, g as INFERENCE, h as HELPERS, m as FILLET, n as reconstructEdgeGeometry, p as EXTRUDE, r as reconstructFaceGeometry, s as notify, u as BODY, w as SKETCH, x as REVOLVE, y as MEASURE } from "./geometry-reconstruction-BOlE2Gpo.mjs";
import { A as toVec3, k as toEulerJSON, m as EXTRUSION_MIN_DEPTH_MM, o as SKETCH_PARAM_ENDPOINT_TOL, t as POINT_COINCIDENCE_TOL_MM } from "./sketch-tolerances-BiDe8q-W.mjs";
import { $ as isSketchPoint, A as findAllIntersections, B as createSketchPlane, Bt as Edge, C as removeNodeById, Dt as isDescendantOf, Et as getObject, F as identifyTrimSegment, Ft as nodeId, G as findSketchPoint, Ht as Vertex, I as isAngleInArcRange, It as flatAxis, K as isConstructionPrimitive, Lt as isFlat, M as findNearestArcExtendTarget, Mt as combineToBoolean, N as findNearestExtendTarget, Nt as isElement3D, O as sweepBRep, Ot as makeBodyOrProfileLabel, P as getArcAngles, Q as isSketchLine, Rt as Brep, S as countOperationsOfType, St as disposeObject3D, T as renameNode, Tt as getAllObjects, Ut as cloneBrep, V as createSketchPlaneFromNormal, W as findSketchLine, X as isSketchArc, Z as isSketchCircle, _ as applyBooleanOperationToTree, _t as collectPicksUnderCursor, at as disposeMeasureOverlay, b as applyRevolveToTree, bt as createMeshFromPath, ct as chamferBRep, d as createSketch, dt as booleanOp, et as makeSketchConstraint, ft as addElement, g as removePrimitiveFromSketch, gt as collectPickableMeshes, h as removeConstraintFromSketch, ht as updateElementRotation, i as createGeometryFromBRep, it as computePointDistance, j as findClosestEndpoint, jt as OP_LABEL, l as addConstraintToSketch, lt as filletBRep, mt as updateElementPosition, n as SketchToBrepService, nt as extrudeBRep, ot as findNearestVertex, pt as removeElement, q as isDimensionalConstraint, r as SketchSolverService, rt as computeAngleBetweenVectors, st as loftBReps, t as ImportExportService, tt as revolveBRep, u as addPrimitiveToSketch, ut as importElements, v as applyExtrudeToTree, vt as createMeshFromBrep, w as removeNodesByElementId, wt as getAllFaces, x as applySweepToTree, xt as disposeAndRemove, y as applyFilletToTree, yt as createMeshFromGeometry, z as normalizeAngle, zt as CompoundBrep } from "./ImportExportService-BV1slDNv.mjs";
import { t as OccWorkerClient } from "./OccWorkerClient-DUjbg_tJ.mjs";
import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { jsx } from "react/jsx-runtime";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
//#region src/scene-operations/selection-operations.ts
function handleSetMode(elements, newMode, objectsMap) {
	return {
		updatedElements: elements.map((element) => {
			const object = objectsMap.get(element.nodeId);
			if (object) {
				if (object instanceof THREE.Mesh) {
					const mat = object.material;
					mat.color.set(BODY.default);
					mat.opacity = 1;
					mat.transparent = false;
					mat.needsUpdate = true;
				} else if (object instanceof THREE.Group) object.traverse((child) => {
					if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) {
						const mat = child.material;
						mat.color.set(BODY.default);
						mat.opacity = 1;
						mat.transparent = false;
						mat.needsUpdate = true;
					}
					if (child instanceof LineSegments2 && child.userData.isEdgeOverlay) {
						const mat = child.material;
						mat.opacity = 1;
						mat.transparent = false;
						mat.needsUpdate = true;
					}
				});
				object.traverse((child) => {
					if (child.userData.helperType === "edge" || child.userData.helperType === "vertex") child.visible = false;
				});
			}
			return {
				...element,
				selected: false
			};
		}),
		mode: newMode
	};
}
function collectAffectedNodeIds(elements, nodeId) {
	const element = elements.find((el) => el.nodeId === nodeId);
	if (!element) return [];
	const nodes = [nodeId];
	if (element.brep instanceof CompoundBrep) elements.forEach((el) => {
		if (el.brep === element.brep) nodes.push(el.nodeId);
	});
	else elements.filter((el) => el.brep instanceof CompoundBrep && el.brep.children.some((child) => child === element.brep)).forEach((parent) => {
		nodes.push(parent.nodeId);
		elements.forEach((el) => {
			if (el.brep === parent.brep || parent.brep.children.includes(el.brep)) nodes.push(el.nodeId);
		});
	});
	return Array.from(new Set(nodes));
}
function applySelectionChange(elements, selectedElements, nodeId, isSelect) {
	const affectedNodeIds = collectAffectedNodeIds(elements, nodeId);
	if (affectedNodeIds.length === 0) return {
		updatedElements: elements,
		updatedSelectedElements: selectedElements,
		affectedNodeIds
	};
	const affectedSet = new Set(affectedNodeIds);
	return {
		updatedElements: elements.map((el) => affectedSet.has(el.nodeId) ? {
			...el,
			selected: isSelect
		} : el),
		updatedSelectedElements: isSelect ? Array.from(new Set([...selectedElements, ...affectedNodeIds])) : selectedElements.filter((id) => !affectedSet.has(id)),
		affectedNodeIds
	};
}
function selectElement(elements, selectedElements, nodeId) {
	return applySelectionChange(elements, selectedElements, nodeId, true);
}
function deselectElement(elements, selectedElements, nodeId) {
	return applySelectionChange(elements, selectedElements, nodeId, false);
}
function applySelectionMaterial(objectsMap, nodeIds, color) {
	nodeIds.forEach((id) => {
		const object = objectsMap.get(id);
		if (object instanceof THREE.Mesh) object.material.color.set(color);
		else if (object instanceof THREE.Group) object.traverse((child) => {
			if (child instanceof THREE.Mesh) child.material.color.set(color);
		});
	});
}
//#endregion
//#region src/contexts/hooks/useMeasurements.ts
function useMeasurements() {
	const [pinnedMeasurements, setPinnedMeasurements] = useState([]);
	return {
		pinnedMeasurements,
		addPinnedMeasurement: useCallback((measurement) => {
			setPinnedMeasurements((prev) => [...prev, {
				...measurement,
				pinned: true
			}]);
		}, []),
		removePinnedMeasurement: useCallback((id) => {
			setPinnedMeasurements((prev) => {
				const measurement = prev.find((m) => m.id === id);
				if (measurement) for (const obj of measurement.overlayObjects) disposeMeasureOverlay(obj);
				return prev.filter((m) => m.id !== id);
			});
		}, []),
		clearPinnedMeasurements: useCallback(() => {
			setPinnedMeasurements((prev) => {
				for (const measurement of prev) for (const obj of measurement.overlayObjects) disposeMeasureOverlay(obj);
				return [];
			});
		}, [])
	};
}
//#endregion
//#region src/contexts/hooks/useFeatureTreeState.ts
function useFeatureTreeState(deps) {
	const [featureTree, setFeatureTree] = useState([]);
	const [sectionExpandedState, setSectionExpandedState] = useState({
		"section-origin": false,
		"section-bodies": true,
		"section-sketches": true
	});
	const [originVisibility, setOriginVisibility] = useState({
		"origin-xy": true,
		"origin-xz": true,
		"origin-yz": true,
		"origin-x-axis": true,
		"origin-y-axis": true,
		"origin-z-axis": true,
		"origin-point": true
	});
	const { applyVisibility } = deps;
	return {
		featureTree,
		setFeatureTree,
		sectionExpandedState,
		originVisibility,
		toggleNodeVisibility: useCallback((nodeId) => {
			const updateNode = (nodes) => {
				return nodes.map((node) => {
					if (node.id === nodeId) {
						const newVisible = !node.visible;
						if (node.elementId) applyVisibility(node.elementId, newVisible);
						if (node.children) {
							const updatedChildren = node.children.map((child) => {
								if (child.elementId) applyVisibility(child.elementId, newVisible);
								return {
									...child,
									visible: newVisible
								};
							});
							return {
								...node,
								visible: newVisible,
								children: updatedChildren
							};
						}
						return {
							...node,
							visible: newVisible
						};
					}
					if (node.children) return {
						...node,
						children: updateNode(node.children)
					};
					return node;
				});
			};
			setFeatureTree((prev) => updateNode(prev));
		}, [applyVisibility]),
		toggleNodeExpanded: useCallback((nodeId) => {
			const updateNode = (nodes) => {
				return nodes.map((node) => {
					if (node.id === nodeId) return {
						...node,
						expanded: !node.expanded
					};
					if (node.children) return {
						...node,
						children: updateNode(node.children)
					};
					return node;
				});
			};
			setFeatureTree((prev) => updateNode(prev));
		}, []),
		renameNode: useCallback((nodeId, newName) => {
			setFeatureTree((prev) => renameNode(prev, nodeId, newName));
		}, []),
		toggleSectionExpanded: useCallback((sectionId) => {
			setSectionExpandedState((prev) => ({
				...prev,
				[sectionId]: !prev[sectionId]
			}));
		}, []),
		toggleOriginVisibility: useCallback((id) => {
			setOriginVisibility((prev) => ({
				...prev,
				[id]: !prev[id]
			}));
		}, [])
	};
}
//#endregion
//#region src/contexts/hooks/useAsyncPendingGuard.ts
function useAsyncPendingGuard() {
	const isOperationPendingRef = useRef(false);
	const [isOperationPending, setIsOperationPending] = useState(false);
	return {
		isOperationPending,
		isOperationPendingRef,
		setOperationPending: useCallback((pending) => {
			isOperationPendingRef.current = pending;
			setIsOperationPending(pending);
		}, [])
	};
}
//#endregion
//#region src/contexts/hooks/useElementMutations.ts
/**
* Owns the canonical scene-element state plus the basic mutations that don't
* cross-cut undo/featureTree/sketch. The composer wraps these with `pushUndo`
* + tree updates to build the public `addElement` / `removeElement` /
* `updateElementBrep` methods.
*
* `*Internal` variants exist because some composer-level orchestrators (sweep
* chained with brep update + remove path, finishSketch's commit) call mutations
* without pushing undo separately, they manage their own snapshot.
*/
function applyAddElement(ctx, brep, position, object) {
	const claimedFromId = ctx.idCounterRef.current;
	ctx.idCounterRef.current = claimedFromId + 1;
	let nodeId;
	ctx.setElements((prevElements) => {
		const result = addElement(prevElements, brep, position, claimedFromId, ctx.objectsMap, object);
		nodeId = result.nodeId;
		return result.updatedElements;
	});
	ctx.setIdCounter(claimedFromId + 1);
	return nodeId;
}
function applyRemoveElement(ctx, nodeId) {
	ctx.setElements((prevElements) => {
		const result = removeElement(prevElements, ctx.selectedElementsRef.current, nodeId, ctx.objectsMap);
		ctx.setSelectedElements(result.updatedSelectedElements);
		return result.updatedElements;
	});
}
/** @internal */
function applySelectElement(ctx, nodeId) {
	const snapshot = ctx.elementsRef.current;
	const result = selectElement(snapshot, ctx.selectedElementsRef.current, nodeId);
	applySelectionMaterial(ctx.objectsMap, result.affectedNodeIds, SELECTION.selected);
	ctx.setSelectedElements(result.updatedSelectedElements);
	ctx.setElements((prev) => prev === snapshot ? result.updatedElements : selectElement(prev, ctx.selectedElementsRef.current, nodeId).updatedElements);
}
/** @internal */
function applyDeselectElement(ctx, nodeId) {
	const snapshot = ctx.elementsRef.current;
	const result = deselectElement(snapshot, ctx.selectedElementsRef.current, nodeId);
	applySelectionMaterial(ctx.objectsMap, result.affectedNodeIds, BODY.default);
	ctx.setSelectedElements(result.updatedSelectedElements);
	ctx.setElements((prev) => prev === snapshot ? result.updatedElements : deselectElement(prev, ctx.selectedElementsRef.current, nodeId).updatedElements);
}
/** @internal */
function applyDeselectAll(ctx, mode) {
	const snapshot = ctx.elementsRef.current;
	const result = handleSetMode(snapshot, mode, ctx.objectsMap);
	ctx.setSelectedElements([]);
	ctx.setElements((prev) => prev === snapshot ? result.updatedElements : prev.map((el) => ({
		...el,
		selected: false
	})));
}
function useElementMutations() {
	const [elements, setElements] = useState([]);
	const [selectedElements, setSelectedElements] = useState([]);
	const [objectsMap] = useState(/* @__PURE__ */ new Map());
	const [idCounter, setIdCounter] = useState(0);
	const elementsRef = useRef(elements);
	useEffect(() => {
		elementsRef.current = elements;
	}, [elements]);
	const selectedElementsRef = useRef(selectedElements);
	useEffect(() => {
		selectedElementsRef.current = selectedElements;
	}, [selectedElements]);
	const idCounterRef = useRef(idCounter);
	useEffect(() => {
		idCounterRef.current = idCounter;
	}, [idCounter]);
	return {
		elements,
		selectedElements,
		idCounter,
		objectsMap,
		elementsRef,
		selectedElementsRef,
		idCounterRef,
		setElements,
		setSelectedElements,
		setIdCounter,
		addElementInternal: useCallback((brep, position, object) => applyAddElement({
			idCounterRef,
			setElements,
			setIdCounter,
			objectsMap
		}, brep, position, object), [objectsMap]),
		removeElementInternal: useCallback((nodeId) => applyRemoveElement({
			selectedElementsRef,
			setElements,
			setSelectedElements,
			objectsMap
		}, nodeId), [objectsMap]),
		updateElementPosition: useCallback((nodeId, position) => {
			setElements((prevElements) => updateElementPosition(prevElements, nodeId, position, objectsMap));
		}, [objectsMap]),
		updateElementRotation: useCallback((nodeId, rotation) => {
			setElements((prevElements) => updateElementRotation(prevElements, nodeId, rotation, objectsMap));
		}, [objectsMap]),
		selectElement: useCallback((nodeId) => applySelectElement({
			elementsRef,
			selectedElementsRef,
			setElements,
			setSelectedElements,
			objectsMap
		}, nodeId), [objectsMap]),
		deselectElement: useCallback((nodeId) => applyDeselectElement({
			elementsRef,
			selectedElementsRef,
			setElements,
			setSelectedElements,
			objectsMap
		}, nodeId), [objectsMap]),
		deselectAll: useCallback((mode) => applyDeselectAll({
			elementsRef,
			selectedElementsRef,
			setElements,
			setSelectedElements,
			objectsMap
		}, mode), [objectsMap]),
		getObject: useCallback((nodeId) => getObject(objectsMap, nodeId), [objectsMap]),
		getAllObjects: useCallback(() => getAllObjects(objectsMap), [objectsMap])
	};
}
//#endregion
//#region src/contexts/hooks/useUndoStack.ts
function buildUndoSnapshot(deps, actionName) {
	return {
		elements: deps.elementsRef.current.map((el) => ({
			...el,
			position: el.position.clone(),
			rotation: el.rotation?.clone()
		})),
		idCounter: deps.idCounterRef.current,
		featureTree: [...deps.featureTreeRef.current],
		sketches: [...deps.sketchesRef.current],
		actionName,
		timestamp: Date.now()
	};
}
function useUndoStack(deps) {
	const undoStackRef = useRef([]);
	const redoStackRef = useRef([]);
	const sketchUndoStackRef = useRef([]);
	const sketchRedoStackRef = useRef([]);
	const [undoRedoVersion, setUndoRedoVersion] = useState(0);
	const bumpVersion = useCallback(() => setUndoRedoVersion((v) => v + 1), []);
	const captureSnapshot = useCallback((actionName) => buildUndoSnapshot({
		elementsRef: deps.elementsRef,
		idCounterRef: deps.idCounterRef,
		featureTreeRef: deps.featureTreeRef,
		sketchesRef: deps.sketchesRef
	}, actionName), [
		deps.elementsRef,
		deps.idCounterRef,
		deps.featureTreeRef,
		deps.sketchesRef
	]);
	const restoreSnapshot = useCallback((snapshot) => {
		const { objectsMap, setElements, setSelectedElements, setIdCounter, setFeatureTree, setSketches } = deps;
		const oldEntries = Array.from(objectsMap.entries());
		for (const [, obj] of oldEntries) disposeAndRemove(obj);
		objectsMap.clear();
		for (const el of snapshot.elements) {
			let mesh;
			if (el.elementType === "path" && el.pathData) mesh = createMeshFromPath(el.pathData.points);
			else if (el.edgeGeometry) mesh = createMeshFromGeometry(el.faceGeometry ?? createGeometryFromBRep(getAllFaces(el.brep)), el.edgeGeometry);
			else mesh = createMeshFromBrep(el.brep);
			mesh.position.copy(el.position);
			if (el.rotation) mesh.rotation.copy(el.rotation);
			mesh.userData.nodeId = el.nodeId;
			objectsMap.set(el.nodeId, mesh);
		}
		setElements(snapshot.elements);
		setIdCounter(snapshot.idCounter);
		setFeatureTree(snapshot.featureTree);
		setSketches(snapshot.sketches);
		setSelectedElements([]);
	}, [deps]);
	const pushUndo = useCallback((actionName) => {
		const snapshot = captureSnapshot(actionName);
		undoStackRef.current = [...undoStackRef.current, snapshot];
		if (undoStackRef.current.length > 50) undoStackRef.current = undoStackRef.current.slice(undoStackRef.current.length - 50);
		redoStackRef.current = [];
		bumpVersion();
	}, [captureSnapshot, bumpVersion]);
	const undo = useCallback(() => {
		if (deps.isOperationPendingRef.current) return;
		if (undoStackRef.current.length === 0) return;
		const snapshot = undoStackRef.current[undoStackRef.current.length - 1];
		undoStackRef.current = undoStackRef.current.slice(0, -1);
		const currentSnapshot = captureSnapshot(snapshot.actionName);
		redoStackRef.current = [...redoStackRef.current, currentSnapshot];
		restoreSnapshot(snapshot);
		bumpVersion();
	}, [
		captureSnapshot,
		restoreSnapshot,
		bumpVersion,
		deps.isOperationPendingRef
	]);
	const redo = useCallback(() => {
		if (deps.isOperationPendingRef.current) return;
		if (redoStackRef.current.length === 0) return;
		const snapshot = redoStackRef.current[redoStackRef.current.length - 1];
		redoStackRef.current = redoStackRef.current.slice(0, -1);
		const currentSnapshot = captureSnapshot(snapshot.actionName);
		undoStackRef.current = [...undoStackRef.current, currentSnapshot];
		restoreSnapshot(snapshot);
		bumpVersion();
	}, [
		captureSnapshot,
		restoreSnapshot,
		bumpVersion,
		deps.isOperationPendingRef
	]);
	const pushSketchSnapshot = useCallback((sketch) => {
		sketchUndoStackRef.current = [...sketchUndoStackRef.current, sketch];
		if (sketchUndoStackRef.current.length > 100) sketchUndoStackRef.current = sketchUndoStackRef.current.slice(sketchUndoStackRef.current.length - 100);
		sketchRedoStackRef.current = [];
		bumpVersion();
	}, [bumpVersion]);
	const pushSketchUndo = useCallback(() => {
		const sketch = deps.activeSketchRef.current;
		if (sketch) pushSketchSnapshot(sketch);
	}, [deps.activeSketchRef, pushSketchSnapshot]);
	const undoSketch = useCallback(() => {
		if (sketchUndoStackRef.current.length === 0) return;
		const snapshot = sketchUndoStackRef.current[sketchUndoStackRef.current.length - 1];
		sketchUndoStackRef.current = sketchUndoStackRef.current.slice(0, -1);
		const current = deps.activeSketchRef.current;
		if (current) sketchRedoStackRef.current = [...sketchRedoStackRef.current, current];
		deps.setActiveSketch(snapshot);
		bumpVersion();
	}, [deps, bumpVersion]);
	const redoSketch = useCallback(() => {
		if (sketchRedoStackRef.current.length === 0) return;
		const snapshot = sketchRedoStackRef.current[sketchRedoStackRef.current.length - 1];
		sketchRedoStackRef.current = sketchRedoStackRef.current.slice(0, -1);
		const current = deps.activeSketchRef.current;
		if (current) sketchUndoStackRef.current = [...sketchUndoStackRef.current, current];
		deps.setActiveSketch(snapshot);
		bumpVersion();
	}, [deps, bumpVersion]);
	const canUndo = undoRedoVersion >= 0 && undoStackRef.current.length > 0;
	const canRedo = undoRedoVersion >= 0 && redoStackRef.current.length > 0;
	const undoActionName = canUndo ? undoStackRef.current[undoStackRef.current.length - 1].actionName : null;
	const redoActionName = canRedo ? redoStackRef.current[redoStackRef.current.length - 1].actionName : null;
	const canUndoSketch = undoRedoVersion >= 0 && sketchUndoStackRef.current.length > 0;
	const canRedoSketch = undoRedoVersion >= 0 && sketchRedoStackRef.current.length > 0;
	return {
		undoStack: undoStackRef.current,
		redoStack: redoStackRef.current,
		pushUndo,
		undo,
		redo,
		canUndo,
		canRedo,
		undoActionName,
		redoActionName,
		pushSketchUndo,
		pushSketchSnapshot,
		undoSketch,
		redoSketch,
		canUndoSketch,
		canRedoSketch,
		undoStackRef,
		redoStackRef,
		sketchUndoStackRef,
		sketchRedoStackRef,
		bumpVersion
	};
}
//#endregion
//#region src/contexts/hooks/useSketchSession.ts
function useSketchSession(deps) {
	const [activeSketch, setActiveSketch] = useState(null);
	const [sketches, setSketches] = useState([]);
	const [previousMode, setPreviousMode] = useState("move");
	const [editingSketchId, setEditingSketchId] = useState(null);
	const solveVersionRef = useRef(0);
	const solveFailedNotifiedRef = useRef(false);
	const previewConstraintSnapshotRef = useRef(null);
	const previewVersionRef = useRef(0);
	const activeSketchRef = useRef(activeSketch);
	useEffect(() => {
		activeSketchRef.current = activeSketch;
	}, [activeSketch]);
	const sketchesRef = useRef(sketches);
	useEffect(() => {
		sketchesRef.current = sketches;
	}, [sketches]);
	const { idCounter, setIdCounter, pushSketchSnapshot } = deps;
	return {
		activeSketch,
		sketches,
		previousMode,
		editingSketchId,
		setActiveSketch,
		setSketches,
		setPreviousMode,
		setEditingSketchId,
		activeSketchRef,
		sketchesRef,
		solveVersionRef,
		previewConstraintSnapshotRef,
		previewVersionRef,
		addPrimitive: useCallback((primitive) => {
			setActiveSketch((currentSketch) => {
				if (!currentSketch) {
					console.warn("No active sketch to add primitive to");
					return null;
				}
				return addPrimitiveToSketch(currentSketch, primitive, idCounter).sketch;
			});
		}, [idCounter]),
		updatePrimitive: useCallback((primitiveId, updates) => {
			setActiveSketch((currentSketch) => {
				if (!currentSketch) {
					console.warn("No active sketch to update primitive in");
					return null;
				}
				const updatedPrimitives = currentSketch.primitives.map((p) => {
					if (p.id === primitiveId) return {
						...p,
						...updates
					};
					return p;
				});
				return {
					...currentSketch,
					primitives: updatedPrimitives
				};
			});
		}, []),
		addConstraint: useCallback((constraint) => {
			if (!activeSketch) {
				console.warn("No active sketch to add constraint to");
				return;
			}
			const result = addConstraintToSketch(activeSketch, constraint, idCounter);
			setActiveSketch(result.sketch);
			setIdCounter(result.nextId);
		}, [
			activeSketch,
			idCounter,
			setIdCounter
		]),
		removePrimitive: useCallback((primitiveId) => {
			setActiveSketch((currentSketch) => {
				if (!currentSketch) {
					console.warn("No active sketch to remove primitive from");
					return null;
				}
				return removePrimitiveFromSketch(currentSketch, primitiveId).sketch;
			});
		}, []),
		removeConstraint: useCallback((constraintId) => {
			setActiveSketch((currentSketch) => {
				if (!currentSketch) {
					console.warn("No active sketch to remove constraint from");
					return null;
				}
				return removeConstraintFromSketch(currentSketch, constraintId).sketch;
			});
		}, []),
		updateConstraint: useCallback((constraintId, updates) => {
			setActiveSketch((currentSketch) => {
				if (!currentSketch) return null;
				return {
					...currentSketch,
					constraints: currentSketch.constraints.map((c) => c.id === constraintId ? {
						...c,
						...updates
					} : c)
				};
			});
		}, []),
		cancelConstraintPreview: useCallback(() => {
			const snapshot = previewConstraintSnapshotRef.current;
			if (snapshot) setActiveSketch(snapshot);
			previewConstraintSnapshotRef.current = null;
			previewVersionRef.current++;
		}, []),
		updatePrimitivesAndSolve: useCallback(async (updates) => {
			const currentVersion = ++solveVersionRef.current;
			const currentSketch = activeSketchRef.current;
			if (!currentSketch) return;
			const updatedPrimitives = currentSketch.primitives.map((p) => {
				const update = updates.get(p.id);
				if (update && p.type === "point") return {
					...p,
					x: update.x,
					y: update.y
				};
				return p;
			});
			const sketchToSolve = {
				...currentSketch,
				primitives: updatedPrimitives
			};
			try {
				const result = await SketchSolverService.getInstance().solve(sketchToSolve);
				if (solveVersionRef.current !== currentVersion) return;
				if (result.success) {
					solveFailedNotifiedRef.current = false;
					setActiveSketch(result.sketch);
				} else if (!solveFailedNotifiedRef.current) {
					notify("Sketch solve failed: constraints cannot be satisfied", "warning");
					solveFailedNotifiedRef.current = true;
				}
			} catch (error) {
				console.error("Sketch solve error during drag:", error);
				if (solveVersionRef.current === currentVersion) setActiveSketch(sketchToSolve);
			}
		}, []),
		updatePrimitivePropertyAndSolve: useCallback(async (primitiveId, updates) => {
			const currentVersion = ++solveVersionRef.current;
			const sketchToSolve = await new Promise((resolve) => {
				setActiveSketch((currentSketch) => {
					if (!currentSketch) {
						resolve(null);
						return null;
					}
					const updatedPrimitives = currentSketch.primitives.map((p) => {
						if (p.id === primitiveId) return {
							...p,
							...updates
						};
						return p;
					});
					const updatedSketch = {
						...currentSketch,
						primitives: updatedPrimitives
					};
					resolve(updatedSketch);
					return updatedSketch;
				});
			});
			if (!sketchToSolve) return;
			if (solveVersionRef.current !== currentVersion) return;
			try {
				const result = await SketchSolverService.getInstance().solve(sketchToSolve);
				if (solveVersionRef.current !== currentVersion) return;
				if (result.success) setActiveSketch(result.sketch);
			} catch (error) {
				console.error("Sketch solve error during property update:", error);
			}
		}, []),
		addConstraintAndSolve: useCallback(async (constraint) => {
			let preConstraintSketch = null;
			const result = await new Promise((resolve) => {
				setActiveSketch((currentSketch) => {
					if (!currentSketch) {
						console.warn("No active sketch to add constraint to");
						resolve(null);
						return null;
					}
					preConstraintSketch = currentSketch;
					const addResult = addConstraintToSketch(currentSketch, constraint, idCounter);
					resolve({
						sketch: addResult.sketch,
						nextId: addResult.nextId
					});
					return addResult.sketch;
				});
			});
			if (!result) return {
				sketch: null,
				status: "failed"
			};
			const { sketch: sketchToSolve, nextId } = result;
			setIdCounter(nextId);
			try {
				const solveResult = await SketchSolverService.getInstance().solve(sketchToSolve);
				if (solveResult.success) {
					if (solveResult.status === "overconstrained") {
						const isRedundant = (solveResult.redundantConstraintIds?.length ?? 0) > 0;
						const isConflicting = (solveResult.conflictingConstraintIds?.length ?? 0) > 0;
						const status = isConflicting ? "conflicting" : "redundant";
						console.warn(`Constraint ${constraint.type} is ${status}. Rolling back.`, isRedundant ? `Redundant IDs: ${solveResult.redundantConstraintIds}` : "", isConflicting ? `Conflicting IDs: ${solveResult.conflictingConstraintIds}` : "");
						if (preConstraintSketch) setActiveSketch(preConstraintSketch);
						return {
							sketch: null,
							status
						};
					}
					setActiveSketch(solveResult.sketch);
					return {
						sketch: solveResult.sketch,
						status: "applied"
					};
				} else {
					if (preConstraintSketch) setActiveSketch(preConstraintSketch);
					notify("Sketch solve failed: constraints cannot be satisfied", "warning");
					return {
						sketch: null,
						status: "failed"
					};
				}
			} catch (error) {
				console.error("Sketch solve error:", error);
				notify(`Sketch solve failed: ${error instanceof Error ? error.message : "unknown error"}`, "warning");
				return {
					sketch: null,
					status: "failed"
				};
			}
		}, [idCounter, setIdCounter]),
		previewConstraint: useCallback(async (constraint) => {
			if (previewConstraintSnapshotRef.current === null) {
				const current = activeSketchRef.current;
				if (!current) return {
					sketch: null,
					status: "failed"
				};
				previewConstraintSnapshotRef.current = current;
			}
			const version = ++previewVersionRef.current;
			const snapshot = previewConstraintSnapshotRef.current;
			const addResult = addConstraintToSketch(snapshot, constraint, idCounter);
			try {
				const solveResult = await SketchSolverService.getInstance().solve(addResult.sketch);
				if (previewVersionRef.current !== version) return {
					sketch: null,
					status: "failed"
				};
				if (solveResult.success) {
					if (solveResult.status === "overconstrained") {
						setActiveSketch(snapshot);
						return {
							sketch: null,
							status: (solveResult.conflictingConstraintIds?.length ?? 0) > 0 ? "conflicting" : "redundant"
						};
					}
					setActiveSketch(solveResult.sketch);
					return {
						sketch: solveResult.sketch,
						status: "applied"
					};
				} else {
					setActiveSketch(snapshot);
					return {
						sketch: null,
						status: "failed"
					};
				}
			} catch {
				if (previewVersionRef.current === version) setActiveSketch(snapshot);
				return {
					sketch: null,
					status: "failed"
				};
			}
		}, [idCounter]),
		commitConstraintPreview: useCallback(() => {
			const snapshot = previewConstraintSnapshotRef.current;
			if (snapshot) pushSketchSnapshot(snapshot);
			previewConstraintSnapshotRef.current = null;
			previewVersionRef.current++;
		}, [pushSketchSnapshot]),
		solveSketch: useCallback(async () => {
			let sketchToSolve = null;
			setActiveSketch((current) => {
				sketchToSolve = current;
				return current;
			});
			if (!sketchToSolve) {
				console.warn("No active sketch to solve");
				return null;
			}
			try {
				const result = await SketchSolverService.getInstance().solve(sketchToSolve);
				if (result.success) {
					setActiveSketch(result.sketch);
					return result.sketch;
				} else {
					notify("Sketch solve failed: constraints cannot be satisfied", "warning");
					return null;
				}
			} catch (error) {
				console.error("Sketch solve error:", error);
				notify(`Sketch solve failed: ${error instanceof Error ? error.message : "unknown error"}`, "warning");
				return null;
			}
		}, [])
	};
}
//#endregion
//#region src/contexts/hooks/useLatest.ts
/**
* Returns a `MutableRefObject` whose `.current` always points at the latest
* value of `value`. Useful for callbacks/effects that need "the most recent
* value" without re-running on every change, e.g. snapshot capture inside
* an undo stack that should not invalidate its dep array on every render.
*/
function useLatest(value) {
	const ref = useRef(value);
	useEffect(() => {
		ref.current = value;
	}, [value]);
	return ref;
}
//#endregion
//#region src/contexts/CoreContext.tsx
const CadCoreContext = createContext(void 0);
const FEATURE_UPDATE_CONFIG = {
	extrude: {
		label: "Extrude",
		counterKey: "extrude",
		applyToTree: (prev, nodeId, name) => applyExtrudeToTree(prev, nodeId, name)
	},
	fillet: {
		label: "Fillet",
		counterKey: "fillet",
		applyToTree: (prev, nodeId, name) => applyFilletToTree(prev, nodeId, name, "fillet")
	},
	chamfer: {
		label: "Chamfer",
		counterKey: "chamfer",
		applyToTree: (prev, nodeId, name) => applyFilletToTree(prev, nodeId, name, "chamfer")
	},
	sweep: {
		label: "Sweep",
		counterKey: "sweep",
		applyToTree: (prev, nodeId, name, consumedId) => consumedId ? applySweepToTree(prev, nodeId, consumedId, name) : prev
	},
	revolve: {
		label: "Revolve",
		counterKey: "revolve",
		applyToTree: (prev, nodeId, name) => applyRevolveToTree(prev, nodeId, name)
	},
	difference: {
		label: "Cut",
		counterKey: "difference"
	}
};
const CadCoreProvider = ({ children }) => {
	const mutations = useElementMutations();
	const { elements, selectedElements, idCounter, objectsMap, elementsRef, selectedElementsRef, idCounterRef, setElements, setSelectedElements, setIdCounter, addElementInternal, removeElementInternal, updateElementPosition, updateElementRotation, selectElement, deselectElement, getObject: getObjectImpl, getAllObjects } = mutations;
	const [mode, setMode] = useState("move");
	const measurements = useMeasurements();
	const { featureTree, setFeatureTree, sectionExpandedState, originVisibility, toggleNodeVisibility, toggleNodeExpanded, renameNode: renameNodeImpl, toggleSectionExpanded, toggleOriginVisibility } = useFeatureTreeState({ applyVisibility: (elementId, visible) => {
		const obj = objectsMap.get(elementId);
		if (obj) obj.visible = visible;
	} });
	const { isOperationPending, isOperationPendingRef, setOperationPending } = useAsyncPendingGuard();
	const featureTreeRef = useLatest(featureTree);
	const sketchActiveSketchHolder = useRef(null);
	const sketchSketchesHolder = useRef([]);
	const sketchSetters = useRef({
		setActiveSketch: () => {},
		setSketches: () => {}
	});
	const undoApi = useUndoStack({
		elementsRef,
		idCounterRef,
		featureTreeRef,
		sketchesRef: sketchSketchesHolder,
		activeSketchRef: sketchActiveSketchHolder,
		isOperationPendingRef,
		objectsMap,
		setElements,
		setSelectedElements,
		setIdCounter,
		setFeatureTree,
		setSketches: ((updater) => sketchSetters.current.setSketches(updater)),
		setActiveSketch: ((updater) => sketchSetters.current.setActiveSketch(updater))
	});
	const { activeSketch, sketches, previousMode, editingSketchId, setActiveSketch, setSketches, setPreviousMode, setEditingSketchId, activeSketchRef, sketchesRef, addPrimitive, updatePrimitive, addConstraint, removePrimitive, removeConstraint, updateConstraint, cancelConstraintPreview, updatePrimitivesAndSolve, updatePrimitivePropertyAndSolve, addConstraintAndSolve, previewConstraint, commitConstraintPreview, solveSketch } = useSketchSession({
		idCounter,
		setIdCounter,
		pushSketchSnapshot: undoApi.pushSketchSnapshot
	});
	sketchActiveSketchHolder.current = activeSketchRef.current;
	sketchSketchesHolder.current = sketchesRef.current;
	sketchSetters.current = {
		setActiveSketch,
		setSketches
	};
	const { pushUndo, undo, redo, canUndo, canRedo, undoActionName, redoActionName, pushSketchUndo, undoSketch, redoSketch, canUndoSketch, canRedoSketch, undoStackRef, redoStackRef, sketchUndoStackRef, sketchRedoStackRef, bumpVersion: setUndoRedoVersionBump } = undoApi;
	const setUndoRedoVersion = useCallback((updater) => {
		setUndoRedoVersionBump();
	}, [setUndoRedoVersionBump]);
	const handleSetMode$1 = useCallback((newMode) => {
		if (isOperationPendingRef.current) return;
		if (activeSketchRef.current && mode === "sketch" && newMode !== "sketch") return;
		if (newMode === "sketch" && mode !== "sketch") setPreviousMode(mode);
		const snapshot = elementsRef.current;
		const result = handleSetMode(snapshot, newMode, objectsMap);
		setMode(result.mode);
		setSelectedElements([]);
		setElements((prev) => prev === snapshot ? result.updatedElements : prev.map((el) => ({
			...el,
			selected: false
		})));
	}, [objectsMap, mode]);
	const addElement = useCallback((brep, position, object) => {
		pushUndo("Add Shape");
		return addElementInternal(brep, position, object);
	}, [addElementInternal, pushUndo]);
	const removeElement = useCallback((nodeId) => {
		pushUndo("Delete");
		removeElementInternal(nodeId);
		setFeatureTree((prev) => removeNodesByElementId(prev, new Set([nodeId])).updatedTree);
	}, [
		removeElementInternal,
		pushUndo,
		setFeatureTree
	]);
	const deselectAll = useCallback(() => {
		mutations.deselectAll(mode);
	}, [mutations, mode]);
	const combineSelectedElementsImpl = useCallback(async (opType, options) => {
		const effectiveSelected = [options.targetId, ...options.toolIds];
		if (effectiveSelected.length < 2) return "need at least 2 elements";
		const opLabel = OP_LABEL[opType];
		const operation = combineToBoolean(opType);
		pushUndo(opLabel);
		setOperationPending(true);
		try {
			const result = await booleanOp(operation, elementsRef.current, effectiveSelected, idCounterRef.current, objectsMap, options);
			if (!result.ok) {
				notify(`${opLabel} failed: ${result.reason}`, "error");
				undoStackRef.current = undoStackRef.current.slice(0, -1);
				setUndoRedoVersion((v) => v + 1);
				return result.reason;
			}
			const value = result.value;
			idCounterRef.current = value.nextIdCounter;
			setElements(() => value.updatedElements);
			setSelectedElements(value.updatedSelectedElements);
			setIdCounter(value.nextIdCounter);
			const newNodeId = nodeId(`node_${value.nextIdCounter}`);
			const consumedIds = options.keepTools ? [options.targetId] : effectiveSelected;
			setFeatureTree((prev) => {
				return applyBooleanOperationToTree(prev, consumedIds, newNodeId, operation, `${opLabel} ${countOperationsOfType(prev, operation) + 1}`);
			});
			return true;
		} catch (error) {
			console.error(`${opLabel} error:`, error);
			notify(`${opLabel} failed: ${error instanceof Error ? error.message : "unknown error"}`, "error");
			undoStackRef.current = undoStackRef.current.slice(0, -1);
			setUndoRedoVersion((v) => v + 1);
			return error instanceof Error ? error.message : "unknown error";
		} finally {
			setOperationPending(false);
		}
	}, [objectsMap, pushUndo]);
	const updateElementBrep = useCallback((nodeId, newBrep, newPosition, featureUpdate, edgeGeometry, occBrep, faceGeometry, vertexPositions) => {
		const existingElement = elementsRef.current.find((el) => el.nodeId === nodeId);
		if (!existingElement) {
			console.warn(`Element ${nodeId} not found for brep update`);
			return;
		}
		const config = featureUpdate ? FEATURE_UPDATE_CONFIG[featureUpdate.type] : void 0;
		pushUndo(config?.label ?? "Update Shape");
		const position = newPosition || existingElement.position;
		let mesh;
		if (edgeGeometry) {
			let geom;
			if (faceGeometry) geom = faceGeometry;
			else geom = createGeometryFromBRep(getAllFaces(newBrep));
			mesh = createMeshFromGeometry(geom, edgeGeometry);
		} else mesh = createMeshFromBrep(newBrep);
		mesh.position.copy(position);
		if (existingElement.rotation) mesh.rotation.copy(existingElement.rotation);
		mesh.userData.nodeId = nodeId;
		const oldObj = objectsMap.get(nodeId);
		if (oldObj) {
			const parent = oldObj.parent;
			disposeAndRemove(oldObj);
			if (parent) parent.add(mesh);
		}
		objectsMap.set(nodeId, mesh);
		setElements((prevElements) => prevElements.map((element) => {
			if (element.nodeId === nodeId) {
				const is3DOperation = featureUpdate?.type === "extrude" || featureUpdate?.type === "sweep" || featureUpdate?.type === "loft" || featureUpdate?.type === "revolve";
				return {
					...element,
					brep: newBrep,
					position,
					occBrep,
					edgeGeometry,
					faceGeometry,
					vertexPositions,
					...is3DOperation ? { sketchPlane: void 0 } : {}
				};
			}
			return element;
		}));
		if (config?.applyToTree) {
			const consumedId = featureUpdate.consumedElementId;
			setFeatureTree((prev) => {
				const name = `${config.label} ${countOperationsOfType(prev, config.counterKey) + 1}`;
				return config.applyToTree(prev, nodeId, name, consumedId);
			});
		}
		if (featureUpdate?.type === "difference" && featureUpdate.consumedElementId) removeElementInternal(featureUpdate.consumedElementId);
	}, [objectsMap, pushUndo]);
	const loftElementsImpl = useCallback((profileNodeIds, resultBrep, resultPosition, edgeGeometry, occBrep, vertexPositions, faceGeometry) => {
		if (profileNodeIds.length < 2) return;
		pushUndo("Loft");
		const consumedIds = profileNodeIds.map(nodeId);
		let mesh;
		if (edgeGeometry) {
			let geom;
			if (faceGeometry) geom = faceGeometry;
			else geom = createGeometryFromBRep(getAllFaces(resultBrep));
			mesh = createMeshFromGeometry(geom, edgeGeometry);
		} else mesh = createMeshFromBrep(resultBrep);
		const newIdCounter = idCounterRef.current + 1;
		const newNodeId = nodeId(`node_${newIdCounter}`);
		idCounterRef.current = newIdCounter;
		mesh.position.copy(resultPosition);
		mesh.userData.nodeId = newNodeId;
		objectsMap.set(newNodeId, mesh);
		const newElements = elementsRef.current.filter((el) => !consumedIds.includes(el.nodeId));
		const newElement = {
			brep: resultBrep,
			nodeId: newNodeId,
			position: resultPosition.clone(),
			selected: false,
			occBrep,
			edgeGeometry,
			vertexPositions
		};
		newElements.push(newElement);
		for (const nodeId of consumedIds) {
			disposeAndRemove(objectsMap.get(nodeId));
			objectsMap.delete(nodeId);
		}
		setElements(() => newElements);
		setSelectedElements([]);
		setIdCounter(newIdCounter);
		setFeatureTree((prev) => {
			return applyBooleanOperationToTree(prev, consumedIds, newNodeId, "loft", `Loft ${countOperationsOfType(prev, "loft") + 1}`);
		});
	}, [objectsMap, pushUndo]);
	const duplicateSelectedElementsImpl = useCallback(() => {
		const currentSelected = selectedElementsRef.current;
		if (currentSelected.length === 0) return;
		pushUndo("Duplicate");
		const newElements = [];
		let nextId = idCounterRef.current;
		for (const nodeId$1 of currentSelected) {
			const element = elementsRef.current.find((el) => el.nodeId === nodeId$1);
			if (!element) continue;
			nextId++;
			const newNodeId = nodeId(`node_${nextId}`);
			const newBrep = cloneBrep(element.brep);
			const newPosition = element.position.clone().add(new THREE.Vector3(1, 1, 0));
			const newRotation = element.rotation ? element.rotation.clone() : void 0;
			const newEdgeGeometry = element.edgeGeometry ? element.edgeGeometry.clone() : void 0;
			const newVertexPositions = element.vertexPositions ? new Float32Array(element.vertexPositions) : void 0;
			const newPathData = element.pathData ? { points: element.pathData.points.map((p) => ({ ...p })) } : void 0;
			let mesh;
			if (newEdgeGeometry) mesh = createMeshFromGeometry(createGeometryFromBRep(getAllFaces(newBrep)), newEdgeGeometry);
			else if (newPathData) mesh = createMeshFromPath(newPathData.points);
			else mesh = createMeshFromBrep(newBrep);
			mesh.position.copy(newPosition);
			if (newRotation) mesh.rotation.copy(newRotation);
			mesh.userData.nodeId = newNodeId;
			const oldObj = objectsMap.get(nodeId$1);
			if (oldObj && oldObj.parent) oldObj.parent.add(mesh);
			objectsMap.set(newNodeId, mesh);
			const newElement = {
				brep: newBrep,
				nodeId: newNodeId,
				position: newPosition,
				selected: false,
				rotation: newRotation,
				elementType: element.elementType,
				pathData: newPathData,
				occBrep: element.occBrep,
				edgeGeometry: newEdgeGeometry,
				vertexPositions: newVertexPositions,
				sketchPlane: element.sketchPlane
			};
			newElements.push(newElement);
		}
		idCounterRef.current = nextId;
		setElements((prev) => [...prev, ...newElements]);
		setIdCounter(nextId);
		setSelectedElements(newElements.map((el) => el.nodeId));
		setFeatureTree((prev) => {
			let tree = [...prev];
			for (const newEl of newElements) {
				const originalNodeId = currentSelected[newElements.indexOf(newEl)];
				let originalName = "Body";
				const findName = (nodes) => {
					for (const n of nodes) {
						if (n.elementId === originalNodeId) return n.name;
						if (n.children) {
							const found = findName(n.children);
							if (found) return found;
						}
					}
					return null;
				};
				const found = findName(tree);
				if (found) originalName = found;
				tree = [...tree, {
					id: `body_${newEl.nodeId}`,
					type: "body",
					name: `Copy of ${originalName}`,
					visible: true,
					elementId: newEl.nodeId
				}];
			}
			return tree;
		});
	}, [objectsMap, pushUndo]);
	const startSketch = useCallback((plane) => {
		const result = createSketch(plane, idCounterRef.current);
		idCounterRef.current = result.nextId;
		setActiveSketch(result.sketch);
		setIdCounter(result.nextId);
		if (mode !== "sketch") setPreviousMode(mode);
		setMode("sketch");
		return result.sketch.id;
	}, [
		mode,
		idCounterRef,
		setIdCounter,
		setActiveSketch,
		setPreviousMode
	]);
	const editSketch = useCallback((sketchId) => {
		if (isOperationPendingRef.current) {
			console.warn("Cannot edit sketch while an operation is pending");
			return;
		}
		if (activeSketch) {
			console.warn("Cannot edit sketch while another sketch is active");
			return;
		}
		const sketch = sketches.find((s) => s.id === sketchId);
		if (!sketch) {
			console.warn(`Sketch ${sketchId} not found`);
			return;
		}
		const sketchNode = featureTree.find((n) => n.id === sketchId && n.type === "sketch");
		if (!sketchNode) {
			console.warn(`Feature tree node for sketch ${sketchId} not found`);
			return;
		}
		pushUndo("Edit Sketch");
		for (const child of sketchNode.children ?? []) if (child.elementId) removeElementInternal(child.elementId);
		setFeatureTree((prev) => prev.map((node) => node.id === sketchId ? {
			...node,
			children: []
		} : node));
		setEditingSketchId(sketchId);
		setActiveSketch(structuredClone(sketch));
		if (mode !== "sketch") setPreviousMode(mode);
		setMode("sketch");
	}, [
		activeSketch,
		sketches,
		featureTree,
		mode,
		pushUndo,
		removeElementInternal
	]);
	const finishSketch = useCallback(async () => {
		if (!activeSketch) {
			console.warn("No active sketch to finish");
			return false;
		}
		pushUndo("Finish Sketch");
		setOperationPending(true);
		sketchUndoStackRef.current = [];
		sketchRedoStackRef.current = [];
		try {
			const finishedSketch = (await SketchSolverService.getInstance().solve(activeSketch)).sketch;
			if (editingSketchId) setSketches((prev) => prev.map((s) => s.id === editingSketchId ? finishedSketch : s));
			else setSketches((prev) => [...prev, finishedSketch]);
			const sketchService = SketchToBrepService.getInstance();
			const conversionResult = await sketchService.convertSketchToProfiles(finishedSketch);
			if (conversionResult.success && conversionResult.profiles.length > 0) {
				const profileChildren = [];
				let currentIdCounter = idCounterRef.current;
				const newProfileElements = [];
				for (let i = 0; i < conversionResult.profiles.length; i++) {
					const profile = conversionResult.profiles[i];
					if (profile.brep.faces.length > 0) {
						currentIdCounter++;
						const nodeId$2 = nodeId(`node_${currentIdCounter}`);
						const position = new THREE.Vector3(profile.center.x, profile.center.y, profile.center.z);
						let edgeGeometry;
						let vertexPositions;
						let occBrep;
						try {
							const profileResult = await OccWorkerClient.getInstance().send({
								type: "processProfile",
								payload: {
									brepJson: profile.brep.toJSON(),
									occBrep: profile.occBrep
								}
							});
							if (profileResult.edgePositions) edgeGeometry = reconstructEdgeGeometry(profileResult.edgePositions);
							if (profileResult.vertexPositions) vertexPositions = profileResult.vertexPositions;
							if (profileResult.occBrep) occBrep = profileResult.occBrep;
						} catch (e) {
							console.warn("Failed to compute profile edge geometry:", e);
						}
						let mesh;
						if (edgeGeometry) mesh = createMeshFromGeometry(createGeometryFromBRep(getAllFaces(profile.brep)), edgeGeometry);
						else mesh = createMeshFromBrep(profile.brep);
						mesh.position.copy(position);
						mesh.userData.nodeId = nodeId$2;
						objectsMap.set(nodeId$2, mesh);
						const newElement = {
							brep: profile.brep,
							nodeId: nodeId$2,
							position: position.clone(),
							selected: false,
							sketchPlane: finishedSketch.plane,
							edgeGeometry,
							vertexPositions,
							occBrep
						};
						newProfileElements.push(newElement);
						profileChildren.push({
							id: profile.id,
							type: "profile",
							name: `Profile ${i + 1} (area: ${profile.area.toFixed(2)})`,
							visible: true,
							sourceSketchId: finishedSketch.id,
							elementId: nodeId$2
						});
					}
				}
				idCounterRef.current = currentIdCounter;
				setElements((prev) => [...prev, ...newProfileElements]);
				setIdCounter(currentIdCounter);
				if (editingSketchId) setFeatureTree((prev) => prev.map((node) => node.id === editingSketchId && node.type === "sketch" ? {
					...node,
					children: profileChildren
				} : node));
				else {
					const sketchNode = {
						id: finishedSketch.id,
						type: "sketch",
						name: `Sketch ${sketches.length + 1}`,
						visible: true,
						expanded: true,
						children: profileChildren,
						sourceSketchId: finishedSketch.id
					};
					setFeatureTree((prev) => [...prev, sketchNode]);
				}
			} else if (!sketchService.isSketchClosed(finishedSketch)) {
				debugLog("[finishSketch] Open sketch detected, creating path element for sweep");
				const wireResult = await sketchService.convertSketchToWire(finishedSketch);
				if (wireResult && wireResult.points.length >= 2) {
					const vertices = wireResult.points.map((p) => new Vertex(p.x, p.y, p.z));
					const edges = [];
					for (let i = 0; i < vertices.length - 1; i++) edges.push(new Edge(vertices[i], vertices[i + 1]));
					const pathBrep = new Brep(vertices, edges, []);
					const currentId = idCounterRef.current + 1;
					idCounterRef.current = currentId;
					const nodeId$3 = nodeId(`node_${currentId}`);
					const position = new THREE.Vector3(0, 0, 0);
					const mesh = createMeshFromPath(wireResult.points);
					mesh.position.copy(position);
					mesh.userData.nodeId = nodeId$3;
					objectsMap.set(nodeId$3, mesh);
					const pathElement = {
						brep: pathBrep,
						nodeId: nodeId$3,
						position: position.clone(),
						selected: false,
						elementType: "path",
						pathData: { points: wireResult.points }
					};
					setElements((prev) => [...prev, pathElement]);
					setIdCounter(currentId);
					const pathChild = {
						id: `${finishedSketch.id}_path`,
						type: "body",
						name: "Path",
						visible: true,
						sourceSketchId: finishedSketch.id,
						elementId: nodeId$3
					};
					if (editingSketchId) setFeatureTree((prev) => prev.map((node) => node.id === editingSketchId && node.type === "sketch" ? {
						...node,
						children: [pathChild]
					} : node));
					else {
						const sketchNode = {
							id: finishedSketch.id,
							type: "sketch",
							name: `Sketch ${sketches.length + 1} (Path)`,
							visible: true,
							expanded: true,
							children: [pathChild],
							sourceSketchId: finishedSketch.id
						};
						setFeatureTree((prev) => [...prev, sketchNode]);
					}
				} else console.warn("[finishSketch] Open sketch produced no valid wire");
			} else {
				const brep = await sketchService.convertSketchToBrep(finishedSketch);
				if (brep.vertices.length > 0 || brep.edges.length > 0 || brep.faces.length > 0) {
					const nodeId = addElementInternal(brep, new THREE.Vector3(0, 0, 0));
					const bodyChild = {
						id: `${finishedSketch.id}_body`,
						type: "body",
						name: "Body",
						visible: true,
						sourceSketchId: finishedSketch.id,
						elementId: nodeId
					};
					if (editingSketchId) setFeatureTree((prev) => prev.map((node) => node.id === editingSketchId && node.type === "sketch" ? {
						...node,
						children: [bodyChild]
					} : node));
					else {
						const sketchNode = {
							id: finishedSketch.id,
							type: "sketch",
							name: `Sketch ${sketches.length + 1}`,
							visible: true,
							expanded: true,
							children: [bodyChild],
							sourceSketchId: finishedSketch.id
						};
						setFeatureTree((prev) => [...prev, sketchNode]);
					}
				} else console.warn("Sketch produced empty BRep - no vertices, edges, or faces");
			}
			setActiveSketch(null);
			setEditingSketchId(null);
			setMode(previousMode);
			setOperationPending(false);
			return true;
		} catch (error) {
			console.error("Error finishing sketch:", error);
			notify(`Error finishing sketch: ${error instanceof Error ? error.message : "unknown error"}`, "error");
			undoStackRef.current = undoStackRef.current.slice(0, -1);
			setUndoRedoVersion((v) => v + 1);
			setActiveSketch(null);
			setEditingSketchId(null);
			setMode(previousMode);
			setOperationPending(false);
			return false;
		}
	}, [
		activeSketch,
		previousMode,
		addElementInternal,
		sketches.length,
		pushUndo,
		editingSketchId
	]);
	const cancelSketch = useCallback(() => {
		sketchUndoStackRef.current = [];
		sketchRedoStackRef.current = [];
		setActiveSketch(null);
		setMode(previousMode);
		if (editingSketchId) {
			setEditingSketchId(null);
			undo();
		}
	}, [
		previousMode,
		editingSketchId,
		undo
	]);
	const deleteNodeImpl = useCallback((nodeId) => {
		pushUndo("Delete");
		function findNode(nodes) {
			for (const node of nodes) {
				if (node.id === nodeId) return node;
				if (node.children) {
					const found = findNode(node.children);
					if (found) return found;
				}
			}
			return null;
		}
		const node = findNode(featureTree);
		if (!node) return;
		if (node.elementId) removeElementInternal(node.elementId);
		if (node.children) {
			for (const child of node.children) if (child.elementId) removeElementInternal(child.elementId);
		}
		setFeatureTree((prev) => removeNodeById(prev, nodeId).updatedTree);
	}, [
		featureTree,
		removeElementInternal,
		pushUndo
	]);
	const importFile = useCallback(async (file) => {
		const ieService = ImportExportService.getInstance();
		const buffer = await file.arrayBuffer();
		const ext = file.name.split(".").pop()?.toLowerCase();
		let results;
		if (ext === "stl") results = await ieService.import(buffer);
		else if (ext === "step" || ext === "stp") results = await ieService.importStep(buffer);
		else throw new Error(`Unsupported file format: .${ext}`);
		pushUndo("Import");
		const result = importElements(elementsRef.current, results, idCounterRef.current, objectsMap);
		idCounterRef.current = result.nextId;
		setElements(() => result.updatedElements);
		setIdCounter(result.nextId);
		const importNodes = result.nodeIds.map((nodeId, i) => ({
			id: `import_${nodeId}`,
			type: "body",
			name: results.length === 1 ? file.name : `${file.name} [${i + 1}]`,
			visible: true,
			elementId: nodeId
		}));
		setFeatureTree((prev) => [...prev, ...importNodes]);
	}, [objectsMap, pushUndo]);
	const exportFile = useCallback(async () => {
		const currentElements = elementsRef.current;
		if (currentElements.length === 0) return;
		const blob = await ImportExportService.getInstance().export(currentElements);
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "export.stl";
		a.click();
		URL.revokeObjectURL(url);
	}, [elementsRef]);
	const exportStepFile = useCallback(async () => {
		const currentElements = elementsRef.current;
		if (currentElements.length === 0) return;
		const blob = await ImportExportService.getInstance().exportStep(currentElements);
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "export.step";
		a.click();
		URL.revokeObjectURL(url);
	}, [elementsRef]);
	const exportProject = useCallback(async () => {
		const blob = ImportExportService.getInstance().exportProject({
			elements: elementsRef.current,
			sketches: sketchesRef.current,
			featureTree: featureTreeRef.current,
			idCounter: idCounterRef.current
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `project.${ImportExportService.PROJECT_FILE_EXTENSION}`;
		a.click();
		URL.revokeObjectURL(url);
	}, [
		elementsRef,
		sketchesRef,
		featureTreeRef,
		idCounterRef
	]);
	const importProject = useCallback(async (file) => {
		const ieService = ImportExportService.getInstance();
		const buffer = await file.arrayBuffer();
		const project = await ieService.importProject(buffer);
		pushUndo("Open Project");
		for (const obj of Array.from(objectsMap.values())) disposeAndRemove(obj);
		objectsMap.clear();
		for (const el of project.elements) {
			const mesh = createMeshFromBrep(el.brep);
			mesh.position.copy(el.position);
			if (el.rotation) mesh.rotation.copy(el.rotation);
			objectsMap.set(el.nodeId, mesh);
		}
		setElements(() => project.elements);
		setSelectedElements([]);
		setIdCounter(project.idCounter);
		idCounterRef.current = project.idCounter;
		setFeatureTree(() => project.featureTree);
		setSketches(() => project.sketches);
		setActiveSketch(() => null);
	}, [
		objectsMap,
		pushUndo,
		setElements,
		setSelectedElements,
		setIdCounter,
		setFeatureTree,
		setSketches,
		setActiveSketch,
		idCounterRef
	]);
	return /* @__PURE__ */ jsx(CadCoreContext.Provider, {
		value: {
			elements,
			selectedElements,
			mode,
			idCounter,
			objectsMap,
			setMode: handleSetMode$1,
			addElement,
			removeElement,
			updateElementPosition,
			selectElement,
			deselectElement,
			deselectAll,
			combineSelectedElements: combineSelectedElementsImpl,
			updateElementRotation,
			getObject: getObjectImpl,
			getAllObjects,
			createMeshFromBrep,
			updateElementBrep,
			loftElements: loftElementsImpl,
			duplicateSelectedElements: duplicateSelectedElementsImpl,
			activeSketch,
			sketches,
			startSketch,
			editSketch,
			editingSketchId,
			addPrimitive,
			updatePrimitive,
			updatePrimitivesAndSolve,
			updatePrimitivePropertyAndSolve,
			addConstraint,
			addConstraintAndSolve,
			previewConstraint,
			cancelConstraintPreview,
			commitConstraintPreview,
			removePrimitive,
			removeConstraint,
			updateConstraint,
			finishSketch,
			cancelSketch,
			solveSketch,
			featureTree,
			toggleNodeVisibility,
			toggleNodeExpanded,
			renameNode: renameNodeImpl,
			deleteNode: deleteNodeImpl,
			sectionExpandedState,
			toggleSectionExpanded,
			originVisibility,
			toggleOriginVisibility,
			undo,
			redo,
			canUndo,
			canRedo,
			undoActionName,
			redoActionName,
			undoStack: undoStackRef.current,
			redoStack: redoStackRef.current,
			pushUndo,
			pushSketchUndo,
			undoSketch,
			redoSketch,
			canUndoSketch,
			canRedoSketch,
			importFile,
			exportFile,
			exportStepFile,
			importProject,
			exportProject,
			pinnedMeasurements: measurements.pinnedMeasurements,
			addPinnedMeasurement: measurements.addPinnedMeasurement,
			removePinnedMeasurement: measurements.removePinnedMeasurement,
			clearPinnedMeasurements: measurements.clearPinnedMeasurements,
			isOperationPending
		},
		children
	});
};
const useCadCore = () => {
	const context = useContext(CadCoreContext);
	if (context === void 0) throw new Error("useCadCore must be used within a CadCoreProvider");
	return context;
};
//#endregion
//#region src/contexts/visualizer/helperVisualizations.ts
/**
* Build a LineSegments overlay highlighting all edges of an element's BRep.
* Returns null if the element has no edges to draw.
*/
function createEdgeHelpers(element) {
	if (!element || !element.brep) return null;
	let brepToVisualize;
	if (element.brep instanceof CompoundBrep) {
		const unifiedBrep = element.brep.cachedUnifiedBRep;
		if (unifiedBrep) brepToVisualize = unifiedBrep;
		else {
			console.warn("CompoundBrep has no unified BRep cached yet");
			if (element.brep.children.length > 0) brepToVisualize = element.brep.children[0];
			else return null;
		}
	} else brepToVisualize = element.brep;
	if (!brepToVisualize.edges || brepToVisualize.edges.length === 0) return null;
	const edgePositions = [];
	brepToVisualize.edges.forEach((edge) => {
		edgePositions.push(edge.start.x, edge.start.y, edge.start.z, edge.end.x, edge.end.y, edge.end.z);
	});
	if (edgePositions.length === 0) return null;
	const edgeGeometry = new THREE.BufferGeometry();
	edgeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edgePositions, 3));
	const edgeMaterial = new THREE.LineBasicMaterial({
		color: HELPERS.edgeColor,
		linewidth: 2,
		depthTest: false
	});
	const lines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
	lines.renderOrder = 999;
	lines.userData.isHelper = true;
	lines.userData.helperType = "edge";
	lines.userData.elementId = element.nodeId;
	return lines;
}
/**
* Build a Group containing one small sphere per BRep vertex.
* Returns null if the element has no vertices.
*/
function createVertexHelpers(element) {
	if (!element || !element.brep) return null;
	let brepToVisualize;
	if (element.brep instanceof CompoundBrep) {
		const unifiedBrep = element.brep.cachedUnifiedBRep;
		if (unifiedBrep) brepToVisualize = unifiedBrep;
		else {
			console.warn("CompoundBrep has no unified BRep cached yet");
			if (element.brep.children.length > 0) brepToVisualize = element.brep.children[0];
			else return null;
		}
	} else brepToVisualize = element.brep;
	if (!brepToVisualize.vertices || brepToVisualize.vertices.length === 0) return null;
	const vertexGroup = new THREE.Group();
	brepToVisualize.vertices.forEach((vertex) => {
		const sphereGeometry = new THREE.SphereGeometry(.05, 16, 16);
		const sphereMaterial = new THREE.MeshBasicMaterial({
			color: HELPERS.vertexColor,
			transparent: false,
			depthTest: false
		});
		const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
		sphere.position.set(vertex.x, vertex.y, vertex.z);
		sphere.renderOrder = 1e3;
		vertexGroup.add(sphere);
	});
	vertexGroup.userData.isHelper = true;
	vertexGroup.userData.helperType = "vertex";
	vertexGroup.userData.elementId = element.nodeId;
	return vertexGroup;
}
//#endregion
//#region src/contexts/visualizer/highlight.ts
/**
* Set hover highlight color on the given object and reveal any edge/vertex helpers it contains.
* No-op if obj is null.
*/
function highlightElement(obj) {
	if (!obj) return;
	if (obj instanceof THREE.Mesh) {
		obj.material.color.set(SELECTION.hover);
		obj.material.needsUpdate = true;
	}
	obj.traverse((child) => {
		if (child.userData.helperType === "edge" || child.userData.helperType === "vertex") child.visible = true;
		if (child instanceof THREE.Mesh && !child.userData.isHelper) {
			child.material.color.set(SELECTION.hover);
			child.material.needsUpdate = true;
		}
	});
}
/**
* Reset color (selected vs default) and hide helpers if not selected.
*/
function unhighlightElement(obj, isSelected) {
	if (!obj) return;
	const color = isSelected ? SELECTION.selected : BODY.default;
	obj.traverse((child) => {
		if (child.userData.helperType === "edge" || child.userData.helperType === "vertex") child.visible = isSelected;
		if (child instanceof THREE.Mesh && !child.userData.isHelper) {
			child.material.color.set(color);
			child.material.needsUpdate = true;
		}
	});
}
//#endregion
//#region src/contexts/visualizer/cameraSwitch.ts
/**
* Switch between perspective and orthographic projection. Mutates refs in place.
* Reconstructs OrbitControls (Three.js requires this for proper zoom behavior on
* the new camera) and re-attaches the on-demand render listeners onto the new
* controls instance via `controlsListenersRef`. Without re-attaching, camera
* input on the new controls produces no `change`/`start`/`end` events feeding
* `requestRender()`, freezing the canvas after every projection toggle.
*/
function switchProjection(refs, newType, setProjectionType, requestRender) {
	const persp = refs.perspCameraRef.current;
	const ortho = refs.orthoCameraRef.current;
	const renderer = refs.rendererRef.current;
	const controls = refs.controlsRef.current;
	if (!persp || !ortho || !renderer || !controls) return;
	const currentCamera = refs.cameraRef.current;
	if (!currentCamera) return;
	const targetCamera = newType === "perspective" ? persp : ortho;
	if (targetCamera === currentCamera) return;
	targetCamera.position.copy(currentCamera.position);
	targetCamera.up.copy(currentCamera.up);
	targetCamera.quaternion.copy(currentCamera.quaternion);
	if (newType === "orthographic") {
		const distance = currentCamera.position.distanceTo(controls.target);
		const fovRad = persp.fov * Math.PI / 180;
		const halfHeight = distance * Math.tan(fovRad / 2);
		const aspect = persp.aspect;
		ortho.left = -halfHeight * aspect;
		ortho.right = halfHeight * aspect;
		ortho.top = halfHeight;
		ortho.bottom = -halfHeight;
		ortho.updateProjectionMatrix();
	}
	const target = controls.target.clone();
	const enableRotate = controls.enableRotate;
	const enableZoom = controls.enableZoom;
	const enablePan = controls.enablePan;
	refs.controlsListenersRef.current?.detach(controls);
	controls.dispose();
	const newControls = new OrbitControls(targetCamera, renderer.domElement);
	newControls.mouseButtons = {
		LEFT: null,
		MIDDLE: THREE.MOUSE.ROTATE,
		RIGHT: THREE.MOUSE.RIGHT
	};
	newControls.target.copy(target);
	newControls.enableRotate = enableRotate;
	newControls.enableZoom = enableZoom;
	newControls.enablePan = enablePan;
	newControls.listenToKeyEvents(window);
	newControls.update();
	refs.controlsRef.current = newControls;
	refs.cameraRef.current = targetCamera;
	refs.controlsListenersRef.current?.attach(newControls);
	setProjectionType(newType);
	requestRender?.();
	if (import.meta.env?.DEV) window.__cadCamera = targetCamera;
}
//#endregion
//#region src/contexts/visualizer/hooks/useCameraAndProjection.ts
/**
* Owns camera refs + projection state. Refs are populated by
* `useSceneAndRenderer.mountRenderer` (via `initSceneObjects()`), so they
* start as null and get filled at mount time. The `switchProjection` callback
* is composed by the Provider since it needs both camera and renderer/controls
* refs (the latter live in `useSceneAndRenderer`).
*/
function useCameraAndProjection() {
	const perspCameraRef = useRef(null);
	const orthoCameraRef = useRef(null);
	const cameraRef = useRef(null);
	const [projectionType, setProjectionTypeState] = useState("perspective");
	return useMemo(() => ({
		perspCameraRef,
		orthoCameraRef,
		cameraRef,
		projectionType,
		setProjectionTypeState
	}), [projectionType]);
}
//#endregion
//#region src/contexts/visualizer/initScene.ts
/**
* Build a fresh Three.js scene with cameras, renderer, and the standard 4-light setup.
* Pure: no refs, no state, no side effects on the DOM yet, caller mounts the renderer.
*
* `width`/`height` should be the canvas container's logical (CSS) dimensions; the
* caller is responsible for re-sizing on container changes (see `useSceneAndRenderer`).
*/
function initSceneObjects(width, height) {
	const scene = new THREE.Scene();
	const canvas = document.createElement("canvas");
	canvas.width = 2;
	canvas.height = 256;
	const ctx = canvas.getContext("2d");
	const gradient = ctx.createLinearGradient(0, 0, 0, 256);
	gradient.addColorStop(0, `#${SCENE.backgroundTop.toString(16).padStart(6, "0")}`);
	gradient.addColorStop(1, `#${SCENE.backgroundBottom.toString(16).padStart(6, "0")}`);
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 2, 256);
	const bgTexture = new THREE.CanvasTexture(canvas);
	bgTexture.needsUpdate = true;
	scene.background = bgTexture;
	const aspect = width / height;
	const perspCamera = new THREE.PerspectiveCamera(75, aspect, .1, 1e3);
	perspCamera.position.set(0, 0, 10);
	const distance = 10;
	const fovRad = 75 * Math.PI / 180;
	const halfHeight = distance * Math.tan(fovRad / 2);
	const orthoCamera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, .1, 1e3);
	orthoCamera.position.set(0, 0, 10);
	const renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(width, height);
	const ambientLight = new THREE.AmbientLight(LIGHTING.ambient.color, LIGHTING.ambient.intensity);
	scene.add(ambientLight);
	const hemisphereLight = new THREE.HemisphereLight(LIGHTING.hemisphereTop, LIGHTING.hemisphereBottom, LIGHTING.hemisphereIntensity);
	scene.add(hemisphereLight);
	const keyLight = new THREE.DirectionalLight(LIGHTING.keyLight.color, LIGHTING.keyLight.intensity);
	keyLight.position.set(...LIGHTING.keyLight.position);
	scene.add(keyLight);
	const fillLight = new THREE.DirectionalLight(LIGHTING.fillLight.color, LIGHTING.fillLight.intensity);
	fillLight.position.set(...LIGHTING.fillLight.position);
	scene.add(fillLight);
	return {
		scene,
		perspCamera,
		orthoCamera,
		renderer,
		bgTexture
	};
}
//#endregion
//#region src/contexts/visualizer/hooks/useSceneAndRenderer.ts
/**
* Owns the scene/renderer/controls refs and the mount/unmount lifecycle.
* Calls into `useCameraAndProjection` for camera ref ownership; this hook
* populates those refs at mount time via `initSceneObjects()`.
*
* Rendering is on-demand: a `requestRender()` schedules at most one rAF.
* OrbitControls `change`/`start`/`end` keep the canvas in sync during user
* input; `setContinuousRender(true)` forces a continuous loop while a
* TransformControls drag or camera animation is in flight.
*/
function useSceneAndRenderer(camera) {
	const sceneRef = useRef(null);
	const rendererRef = useRef(null);
	const controlsRef = useRef(null);
	const containerRef = useRef(null);
	const cleanupRef = useRef(null);
	const navToolActiveRef = useRef(false);
	const controlsListenersRef = useRef(null);
	const [sceneReady, setSceneReady] = useState(false);
	const requestRenderImplRef = useRef(null);
	const setContinuousImplRef = useRef(null);
	const resizeListenersRef = useRef(/* @__PURE__ */ new Set());
	const requestRender = useCallback(() => {
		requestRenderImplRef.current?.();
	}, []);
	const setContinuousRender = useCallback((active) => {
		setContinuousImplRef.current?.(active);
	}, []);
	const subscribeResize = useCallback((listener) => {
		resizeListenersRef.current.add(listener);
		return () => {
			resizeListenersRef.current.delete(listener);
		};
	}, []);
	const mountRenderer = useCallback((container) => {
		containerRef.current = container;
		const initialWidth = container.clientWidth || window.innerWidth;
		const initialHeight = container.clientHeight || window.innerHeight;
		const { scene, perspCamera, orthoCamera, renderer, bgTexture } = initSceneObjects(initialWidth, initialHeight);
		sceneRef.current = scene;
		camera.perspCameraRef.current = perspCamera;
		camera.orthoCameraRef.current = orthoCamera;
		camera.cameraRef.current = perspCamera;
		rendererRef.current = renderer;
		if (import.meta.env?.DEV) {
			window.__cadScene = scene;
			window.__cadCamera = perspCamera;
		}
		container.appendChild(renderer.domElement);
		const controls = new OrbitControls(perspCamera, renderer.domElement);
		controls.mouseButtons = {
			LEFT: null,
			MIDDLE: THREE.MOUSE.ROTATE,
			RIGHT: THREE.MOUSE.RIGHT
		};
		controls.enableZoom = true;
		controls.enableRotate = true;
		controls.enablePan = true;
		controls.listenToKeyEvents(window);
		controlsRef.current = controls;
		let renderPending = false;
		let continuousActive = false;
		let rafId = null;
		const renderFrame = () => {
			rafId = null;
			renderPending = false;
			controlsRef.current?.update();
			if (camera.cameraRef.current) renderer.render(scene, camera.cameraRef.current);
			if (continuousActive) requestRenderInternal();
		};
		const requestRenderInternal = () => {
			if (renderPending) return;
			renderPending = true;
			rafId = requestAnimationFrame(renderFrame);
		};
		const setContinuousInternal = (active) => {
			continuousActive = active;
			if (active) requestRenderInternal();
		};
		requestRenderImplRef.current = requestRenderInternal;
		setContinuousImplRef.current = setContinuousInternal;
		const onControlsChange = () => requestRenderInternal();
		const onControlsStart = () => setContinuousInternal(true);
		const onControlsEnd = () => setContinuousInternal(false);
		const attachControlsListeners = (c) => {
			c.addEventListener("change", onControlsChange);
			c.addEventListener("start", onControlsStart);
			c.addEventListener("end", onControlsEnd);
		};
		const detachControlsListeners = (c) => {
			c.removeEventListener("change", onControlsChange);
			c.removeEventListener("start", onControlsStart);
			c.removeEventListener("end", onControlsEnd);
		};
		attachControlsListeners(controls);
		controlsListenersRef.current = {
			attach: attachControlsListeners,
			detach: detachControlsListeners
		};
		requestRenderInternal();
		const handleAltKeyDown = (e) => {
			if (e.key === "Alt" && controlsRef.current && !navToolActiveRef.current) {
				controlsRef.current.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
				renderer.domElement.style.cursor = "grab";
			}
		};
		const handleAltKeyUp = (e) => {
			if (e.key === "Alt" && controlsRef.current && !navToolActiveRef.current) {
				controlsRef.current.mouseButtons.LEFT = null;
				renderer.domElement.style.cursor = "";
			}
		};
		const handleWindowBlur = () => {
			if (controlsRef.current && !navToolActiveRef.current) {
				controlsRef.current.mouseButtons.LEFT = null;
				renderer.domElement.style.cursor = "";
			}
		};
		window.addEventListener("keydown", handleAltKeyDown);
		window.addEventListener("keyup", handleAltKeyUp);
		window.addEventListener("blur", handleWindowBlur);
		setSceneReady(true);
		const handleResize = (width, height) => {
			if (width <= 0 || height <= 0) return;
			const aspect = width / height;
			if (camera.perspCameraRef.current) {
				camera.perspCameraRef.current.aspect = aspect;
				camera.perspCameraRef.current.updateProjectionMatrix();
			}
			if (camera.cameraRef.current instanceof THREE.OrthographicCamera && camera.orthoCameraRef.current && controlsRef.current && camera.perspCameraRef.current) {
				const dist = camera.orthoCameraRef.current.position.distanceTo(controlsRef.current.target);
				const fov = camera.perspCameraRef.current.fov * Math.PI / 180;
				const hh = dist * Math.tan(fov / 2);
				camera.orthoCameraRef.current.left = -hh * aspect;
				camera.orthoCameraRef.current.right = hh * aspect;
				camera.orthoCameraRef.current.top = hh;
				camera.orthoCameraRef.current.bottom = -hh;
				camera.orthoCameraRef.current.updateProjectionMatrix();
			}
			renderer.setSize(width, height);
			scene.traverse((obj) => {
				if (obj instanceof Line2) {
					const mat = obj.material;
					if (mat instanceof LineMaterial) mat.resolution.set(width, height);
				}
			});
			resizeListenersRef.current.forEach((listener) => {
				listener(width, height);
			});
			requestRenderInternal();
		};
		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const cr = entry.contentRect;
			handleResize(cr.width, cr.height);
		});
		ro.observe(container);
		handleResize(initialWidth, initialHeight);
		cleanupRef.current = () => {
			continuousActive = false;
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
			ro.disconnect();
			if (controlsRef.current) detachControlsListeners(controlsRef.current);
			window.removeEventListener("keydown", handleAltKeyDown);
			window.removeEventListener("keyup", handleAltKeyUp);
			window.removeEventListener("blur", handleWindowBlur);
			controlsRef.current?.dispose();
			controlsRef.current = null;
			controlsListenersRef.current = null;
			requestRenderImplRef.current = null;
			setContinuousImplRef.current = null;
			disposeObject3D(scene);
			bgTexture.dispose();
			scene.background = null;
			if (import.meta.env?.DEV) {
				const w = window;
				delete w.__cadScene;
				delete w.__cadCamera;
			}
			if (containerRef.current && renderer.domElement.parentNode === containerRef.current) containerRef.current.removeChild(renderer.domElement);
			renderer.forceContextLoss();
			renderer.dispose();
			sceneRef.current = null;
			rendererRef.current = null;
		};
	}, [camera]);
	const unmountRenderer = useCallback(() => {
		cleanupRef.current?.();
		cleanupRef.current = null;
	}, []);
	return {
		sceneRef,
		rendererRef,
		controlsRef,
		containerRef,
		cleanupRef,
		navToolActiveRef,
		controlsListenersRef,
		scene: sceneRef.current,
		renderer: rendererRef.current,
		controls: controlsRef.current,
		sceneReady,
		mountRenderer,
		unmountRenderer,
		requestRender,
		setContinuousRender,
		subscribeResize
	};
}
//#endregion
//#region src/contexts/visualizer/hooks/useMouseInteraction.ts
/**
* Owns the cursor position state + the drawing plane used by the raycaster.
* Takes camera + renderer refs from `useSceneAndRenderer`.
*/
function useMouseInteraction(cameraRef, rendererRef) {
	const drawingPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
	const [cursorPosition, setCursorPosition] = useState(null);
	const getMouseIntersection = useCallback((event) => {
		const renderer = rendererRef.current;
		const camera = cameraRef.current;
		if (!renderer || !camera) return null;
		const drawingPlane = drawingPlaneRef.current;
		const raycaster = new THREE.Raycaster();
		const rect = renderer.domElement.getBoundingClientRect();
		const mouse = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
		raycaster.setFromCamera(mouse, camera);
		const intersection = new THREE.Vector3();
		return raycaster.ray.intersectPlane(drawingPlane, intersection) ? intersection : null;
	}, [cameraRef, rendererRef]);
	return {
		cursorPosition,
		getMouseIntersection,
		updateCursorPosition: useCallback((event) => {
			setCursorPosition(getMouseIntersection(event));
		}, [getMouseIntersection]),
		setDrawingPlane: useCallback((normal, constant = 0) => {
			drawingPlaneRef.current.set(normal, constant);
		}, [])
	};
}
//#endregion
//#region src/visual-constants.ts
/**
* Visual / UI rendering constants. **Not tolerances**, these are
* designer-tunable display choices (z-fighting offsets, drag sensitivities,
* camera safety floors). Kept separate from `tolerances.ts` and
* `sketch-tolerances.ts` so retuning visuals never touches CAD precision.
*
* All exports are `@internal`, not part of the public library API.
*/
/**
* Z-offset (in mm) applied when projecting 2D sketch geometry onto the
* sketch plane, so it renders above the XY plane and avoids z-fighting
* with the ground plane / scene background.
* @internal
*/
const SKETCH_PLANE_Z_LIFT_MM = .01;
/**
* Z-offset (in mm) applied to sketch trim/extend *preview* lines so they
* render above committed sketch geometry (which uses
* `SKETCH_PLANE_Z_LIFT_MM = 0.01`).
* @internal
*/
const SKETCH_PREVIEW_Z_LIFT_MM = .02;
/**
* Z-offset (in mm) applied to the ground-plane mesh so it sits just
* below all scene geometry without z-fighting.
* @internal
*/
const GROUND_PLANE_Z_OFFSET = -.01;
/**
* Minimum camera-to-pivot distance (in mm) used as a divide-by-zero
* safety floor in camera animations.
* @internal
*/
const CAMERA_MIN_DISTANCE = .001;
//#endregion
//#region src/contexts/visualizer/hooks/useGroundPlane.ts
/**
* Owns the visible/hidden state of the ground plane and grid. Adds the group
* to the scene when shown, removes + disposes when hidden, and re-runs both
* paths when sceneReady transitions from false to true (so the plane appears
* on first mount).
*/
function useGroundPlane(sceneRef, sceneReady) {
	const [showGroundPlane, setShowGroundPlane] = useState(true);
	const groundPlaneRef = useRef(null);
	const toggleGroundPlane = useCallback(() => {
		setShowGroundPlane((prev) => !prev);
	}, []);
	useEffect(() => {
		const scene = sceneRef.current;
		if (!scene) return;
		if (groundPlaneRef.current) {
			scene.remove(groundPlaneRef.current);
			disposeObject3D(groundPlaneRef.current);
			groundPlaneRef.current = null;
		}
		if (showGroundPlane) {
			const groundGroup = new THREE.Group();
			groundGroup.userData.isGroundPlane = true;  groundGroup.position.set(0, 0.772, 0);
			const gridSize = 0.4;  const gridHelper = new THREE.GridHelper(gridSize, 8, SCENE.gridMajor, SCENE.gridMinor);
			gridHelper.rotation.x = Math.PI / 2;
			gridHelper.position.z = -.02;
			if (Array.isArray(gridHelper.material)) gridHelper.material.forEach((m) => {
				m.depthWrite = false;
			});
			else gridHelper.material.depthWrite = false;
			const planeGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
			const planeMaterial = new THREE.MeshStandardMaterial({
				color: SCENE.groundPlane,
				transparent: false,  opacity: 1.0,
				side: THREE.DoubleSide,
				depthWrite: false
			});
			const plane = new THREE.Mesh(planeGeometry, planeMaterial);
			plane.position.z = GROUND_PLANE_Z_OFFSET;
			groundGroup.add(gridHelper);
			groundGroup.add(plane);
			scene.add(groundGroup);
			groundPlaneRef.current = groundGroup;
		}
	}, [
		showGroundPlane,
		sceneReady,
		sceneRef
	]);
	return {
		showGroundPlane,
		toggleGroundPlane
	};
}
//#endregion
//#region src/contexts/VisualizerContext.tsx
const CadVisualizerContext = createContext(void 0);
const CadVisualizerProvider = ({ children }) => {
	const { elements, getObject } = useCadCore();
	const camera = useCameraAndProjection();
	const sceneAndRenderer = useSceneAndRenderer(camera);
	const mouse = useMouseInteraction(camera.cameraRef, sceneAndRenderer.rendererRef);
	const groundPlane = useGroundPlane(sceneAndRenderer.sceneRef, sceneAndRenderer.sceneReady);
	const [forceUpdate, setForceUpdate] = useState(0);
	const [gridSpacing, setGridSpacing] = useState(.5);
	const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
	const selectOtherRef = useRef(null);
	const forceSceneUpdate = useCallback(() => {
		setForceUpdate((prev) => prev + 1);
	}, []);
	const switchProjection$1 = useCallback((newType) => {
		switchProjection({
			perspCameraRef: camera.perspCameraRef,
			orthoCameraRef: camera.orthoCameraRef,
			cameraRef: camera.cameraRef,
			rendererRef: sceneAndRenderer.rendererRef,
			controlsRef: sceneAndRenderer.controlsRef,
			controlsListenersRef: sceneAndRenderer.controlsListenersRef
		}, newType, camera.setProjectionTypeState, sceneAndRenderer.requestRender);
	}, [
		camera,
		sceneAndRenderer.rendererRef,
		sceneAndRenderer.controlsRef,
		sceneAndRenderer.controlsListenersRef,
		sceneAndRenderer.requestRender
	]);
	const setProjectionType = useCallback((type) => {
		switchProjection$1(type);
	}, [switchProjection$1]);
	const toggleProjection = useCallback(() => {
		switchProjection$1((camera.cameraRef.current instanceof THREE.PerspectiveCamera ? "perspective" : "orthographic") === "perspective" ? "orthographic" : "perspective");
	}, [switchProjection$1, camera.cameraRef]);
	const setCameraRotationEnabled = useCallback((enabled) => {
		if (sceneAndRenderer.controlsRef.current) sceneAndRenderer.controlsRef.current.enableRotate = enabled;
	}, [sceneAndRenderer.controlsRef]);
	const highlightElement$1 = useCallback((nodeId) => {
		highlightElement(getObject(nodeId) ?? null);
	}, [getObject]);
	const unhighlightElement$1 = useCallback((nodeId) => {
		const element = elements.find((el) => el.nodeId === nodeId);
		unhighlightElement(getObject(nodeId) ?? null, element?.selected ?? false);
	}, [getObject, elements]);
	useEffect(() => {
		const scene = sceneAndRenderer.sceneRef.current;
		if (!scene) return;
		elements.forEach((element) => {
			const obj = getObject(element.nodeId);
			if (obj) {
				if (!scene.children.includes(obj)) scene.add(obj);
				if (!obj.position.equals(element.position)) obj.position.copy(element.position);
				if (element.rotation && !obj.rotation.equals(element.rotation)) obj.rotation.copy(element.rotation);
			}
		});
		const validObjects = new Set(elements.map((el) => getObject(el.nodeId)));
		const objectsToRemove = scene.children.filter((child) => {
			if (child instanceof THREE.Light || child instanceof THREE.Camera || child.type === "GridHelper" || child.type === "AxesHelper" || child.userData.isHelper || child.userData.isPreview === true || child.userData.helperType === "gizmo" || child.userData.helperType === "handleType" || child.userData.handleType !== void 0 || child.userData.isGroundPlane === true || child.userData.isSketchGrid === true || child.userData.isSelectionPlanes === true || child.userData.isOriginHelper === true || child.type === "TransformControlsGizmo" || child.userData.isSketchPrimitive === true || child.userData.primitiveId !== void 0 || child.userData.isSketchObject === true || child.userData.isMeasureOverlay === true || child.userData.isMeasureEdgeOverlay === true || child.userData.isFilletEdgeOverlay === true) return false;
			let curr = child;
			while (curr) {
				if (validObjects.has(curr)) return false;
				curr = curr.parent;
			}
			if (child.userData && child.userData.nodeId) {
				if (elements.find((el) => el.nodeId === child.userData.nodeId)) return false;
			}
			return true;
		});
		if (objectsToRemove.length > 0) objectsToRemove.forEach((child) => {
			scene.remove(child);
			disposeObject3D(child);
		});
		sceneAndRenderer.requestRender();
	}, [
		elements,
		getObject,
		sceneAndRenderer.sceneRef,
		sceneAndRenderer.requestRender,
		forceUpdate
	]);
	const value = useMemo(() => ({
		scene: sceneAndRenderer.sceneRef.current,
		camera: camera.cameraRef.current,
		renderer: sceneAndRenderer.rendererRef.current,
		controls: sceneAndRenderer.controlsRef.current,
		createEdgeHelpers,
		createVertexHelpers,
		getMouseIntersection: mouse.getMouseIntersection,
		mountRenderer: sceneAndRenderer.mountRenderer,
		unmountRenderer: sceneAndRenderer.unmountRenderer,
		highlightElement: highlightElement$1,
		unhighlightElement: unhighlightElement$1,
		forceSceneUpdate,
		requestRender: sceneAndRenderer.requestRender,
		setContinuousRender: sceneAndRenderer.setContinuousRender,
		subscribeResize: sceneAndRenderer.subscribeResize,
		showGroundPlane: groundPlane.showGroundPlane,
		toggleGroundPlane: groundPlane.toggleGroundPlane,
		cursorPosition: mouse.cursorPosition,
		updateCursorPosition: mouse.updateCursorPosition,
		sceneReady: sceneAndRenderer.sceneReady,
		setCameraRotationEnabled,
		setDrawingPlane: mouse.setDrawingPlane,
		projectionType: camera.projectionType,
		setProjectionType,
		toggleProjection,
		navToolActiveRef: sceneAndRenderer.navToolActiveRef,
		controlsRef: sceneAndRenderer.controlsRef,
		selectOtherRef,
		gridSpacing,
		setGridSpacing,
		gridSnapEnabled,
		setGridSnapEnabled
	}), [
		sceneAndRenderer.sceneRef,
		sceneAndRenderer.rendererRef,
		sceneAndRenderer.controlsRef,
		sceneAndRenderer.navToolActiveRef,
		sceneAndRenderer.sceneReady,
		sceneAndRenderer.mountRenderer,
		sceneAndRenderer.unmountRenderer,
		sceneAndRenderer.requestRender,
		sceneAndRenderer.setContinuousRender,
		sceneAndRenderer.subscribeResize,
		camera.cameraRef,
		camera.projectionType,
		mouse.getMouseIntersection,
		mouse.cursorPosition,
		mouse.updateCursorPosition,
		mouse.setDrawingPlane,
		highlightElement$1,
		unhighlightElement$1,
		forceSceneUpdate,
		groundPlane.showGroundPlane,
		groundPlane.toggleGroundPlane,
		setCameraRotationEnabled,
		setProjectionType,
		toggleProjection,
		gridSpacing,
		gridSnapEnabled
	]);
	return /* @__PURE__ */ jsx(CadVisualizerContext.Provider, {
		value,
		children
	});
};
const useCadVisualizer = () => {
	const context = useContext(CadVisualizerContext);
	if (!context) throw new Error("useCadVisualizer must be used within a CadVisualizerProvider");
	return context;
};
//#endregion
//#region src/hooks/shared/useRaycastToObjects.ts
/**
* Stable Raycaster scoped to a single consumer hook, so mode input-handlers
* don't allocate a fresh `THREE.Raycaster` on every event.
*
* Returns:
*   - `raycastToObjects(event, objects, recursive?)`, convenience that runs
*     `intersectObjects` against a known list. Most input-handlers want this.
*   - `raycasterFromEvent(event)`, sets the raycaster from the cursor and
*     returns the underlying `THREE.Raycaster`. Use this when passing to
*     helpers like `collectPicksUnderCursor` that need the Raycaster object.
*/
function useRaycastToObjects(line2Threshold = 8) {
	const { renderer, camera } = useCadVisualizer();
	const raycasterRef = useRef(new THREE.Raycaster());
	const raycasterFromEvent = useCallback((event) => {
		if (!renderer || !camera) return null;
		const rect = renderer.domElement.getBoundingClientRect();
		const mouse = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
		raycasterRef.current.setFromCamera(mouse, camera);
		raycasterRef.current.camera = camera;
		raycasterRef.current.params.Line2 = { threshold: line2Threshold };
		return raycasterRef.current;
	}, [
		renderer,
		camera,
		line2Threshold
	]);
	return {
		raycastToObjects: useCallback((event, objects, recursive = false) => {
			const r = raycasterFromEvent(event);
			return r ? r.intersectObjects(objects, recursive) : [];
		}, [raycasterFromEvent]),
		raycasterFromEvent
	};
}
//#endregion
//#region src/hooks/useSelectOther.ts
const HOLD_MS = 400;
const DRAG_THRESHOLD_PX = 4;
/**
* Owns the Fusion 360-style "Select Other" overlay: a hold timer that fires
* the menu after ~400 ms of unbroken LMB hold, plus an explicit right-click
* entry point. Callers (mode hooks) provide the candidate list per event and
* the onPick callback they want invoked when the user chooses a row.
*/
function useSelectOther() {
	const [menu, setMenu] = useState(null);
	const holdTimerRef = useRef(null);
	const holdStartRef = useRef(null);
	const clearTimer = useCallback(() => {
		if (holdTimerRef.current !== null) {
			window.clearTimeout(holdTimerRef.current);
			holdTimerRef.current = null;
		}
	}, []);
	const cancelHold = useCallback(() => {
		clearTimer();
		holdStartRef.current = null;
	}, [clearTimer]);
	const closeMenu = useCallback(() => {
		setMenu(null);
	}, []);
	const startHold = useCallback((event, candidates, callbacks) => {
		if (candidates.length <= 1) return;
		cancelHold();
		holdStartRef.current = {
			x: event.clientX,
			y: event.clientY
		};
		const startedAt = holdStartRef.current;
		holdTimerRef.current = window.setTimeout(() => {
			holdTimerRef.current = null;
			if (holdStartRef.current === startedAt) {
				callbacks.onMenuOpen?.();
				setMenu({
					x: startedAt.x,
					y: startedAt.y,
					items: candidates,
					...callbacks
				});
			}
		}, 400);
	}, [cancelHold]);
	const openFromContextMenu = useCallback((event, candidates, callbacks) => {
		if (candidates.length === 0) return;
		cancelHold();
		callbacks.onMenuOpen?.();
		setMenu({
			x: event.clientX,
			y: event.clientY,
			items: candidates,
			...callbacks
		});
	}, [cancelHold]);
	const latestRef = useRef({
		startHold,
		cancelHold,
		openFromContextMenu,
		closeMenu
	});
	latestRef.current = {
		startHold,
		cancelHold,
		openFromContextMenu,
		closeMenu
	};
	return {
		api: useRef({
			startHold: (event, candidates, callbacks) => latestRef.current.startHold(event, candidates, callbacks),
			cancelHold: () => latestRef.current.cancelHold(),
			openFromContextMenu: (event, candidates, callbacks) => latestRef.current.openFromContextMenu(event, candidates, callbacks),
			closeMenu: () => latestRef.current.closeMenu()
		}).current,
		menu,
		setMenu
	};
}
//#endregion
//#region src/hooks/shared/createModeInputHandlers.ts
/**
* Build the standard mode-input handler set.
*
* Owned by the factory:
* - LMB-only gate, alt-key bypass, `navToolActiveRef`/`isApplyingRef` short-circuits.
* - `selectOtherRef.startHold` integration with `onHover`/`onPick`/`onMenuOpen`/`onCancel` routed back to spec callbacks.
* - Drag threshold (cancel hold once the cursor moves past `DRAG_THRESHOLD_PX`).
* - Mouseup hold-cancel.
* - Optional drag protocol (`onDragStart`/`onDrag`/`onDragEnd`): when
*   `onDragStart` returns `true`, hold-menu and hover are suppressed and
*   mousemove/mouseup are routed to the drag callbacks until mouseup clears
*   drag state.
* - Right-click → `selectOtherRef.openFromContextMenu` (when enabled).
* - Escape → `onCancel()`; Enter → `onCommit?.()`; otherwise dispatch via `extraKeys`.
*
* Caller-owned (in the spec):
* - What to raycast against (`pickTargets`, `hoverTargets`).
* - What to do on pick / hover / menu-pick (`onPickStart`, `onHover`, `onPickFromMenu`).
* - Mode-specific cleanup on cancel.
*/
function createModeInputHandlers(spec, deps, refs) {
	const { holdStartRef, lastResolvedRef, dragActiveRef } = refs;
	const isInactive = () => Boolean(deps.navToolActiveRef.current) || Boolean(deps.isApplyingRef.current);
	const buildMenuCallbacks = (resolved) => {
		let menuHover;
		if (spec.onMenuHover) menuHover = spec.onMenuHover;
		else if (spec.onHover) menuHover = (item) => {
			spec.onHover?.(item ? resolved : null);
		};
		return {
			onPick: (item) => {
				spec.onPickFromMenu(item, resolved);
			},
			onHover: menuHover,
			onMenuOpen: spec.onMenuOpen ? () => spec.onMenuOpen?.(resolved) : void 0,
			onCancel: spec.onMenuCancel ? () => spec.onMenuCancel?.(resolved) : void 0
		};
	};
	const handleMouseDown = (event) => {
		if (event.button !== 0 || event.altKey || isInactive()) return;
		const raycaster = deps.raycasterFromEvent(event);
		if (!raycaster) return;
		const result = spec.pickTargets(raycaster, event);
		if (!result) return;
		const { picks, resolved } = result;
		lastResolvedRef.current = resolved;
		spec.onPickStart(resolved, picks, event);
		if (spec.onDragStart && spec.onDragStart(resolved, picks, event)) {
			dragActiveRef.current = true;
			event.stopPropagation();
			return;
		}
		if (picks.length > 0) {
			holdStartRef.current = {
				x: event.clientX,
				y: event.clientY
			};
			deps.selectOtherRef?.current?.startHold(event, picks, buildMenuCallbacks(resolved));
		}
		event.stopPropagation();
	};
	const handleMouseMove = (event) => {
		if (deps.isApplyingRef.current) return;
		spec.onPointerMove?.(event);
		if (dragActiveRef.current) {
			spec.onDrag?.(event);
			return;
		}
		const start = holdStartRef.current;
		if (start) {
			const dx = event.clientX - start.x;
			const dy = event.clientY - start.y;
			if (Math.hypot(dx, dy) > 4) {
				deps.selectOtherRef?.current?.cancelHold();
				holdStartRef.current = null;
			}
		}
		if (!spec.hoverTargets || !spec.onHover) return;
		const raycaster = deps.raycasterFromEvent(event);
		if (!raycaster) return;
		const hoverPick = spec.hoverTargets(raycaster, event);
		spec.onHover(hoverPick);
	};
	const handleMouseUp = (event) => {
		if (dragActiveRef.current) {
			dragActiveRef.current = false;
			spec.onDragEnd?.(event);
			return;
		}
		spec.onPointerUp?.(event);
		deps.selectOtherRef?.current?.cancelHold();
		holdStartRef.current = null;
	};
	const handleContextMenu = (event) => {
		if (!spec.enableContextMenu || isInactive()) return;
		const raycaster = deps.raycasterFromEvent(event);
		if (!raycaster) return;
		const result = spec.pickTargets(raycaster, event);
		if (!result || result.picks.length === 0) return;
		const { picks, resolved } = result;
		lastResolvedRef.current = resolved;
		event.preventDefault();
		event.stopPropagation();
		deps.selectOtherRef?.current?.openFromContextMenu(event, picks, buildMenuCallbacks(resolved));
	};
	const handleKeyDown = (event) => {
		if (event.key === "Escape") {
			spec.onCancel();
			return;
		}
		if (event.key === "Enter" && spec.onCommit) {
			spec.onCommit();
			return;
		}
		const extra = spec.extraKeys?.[event.key];
		if (extra) extra(event);
	};
	return {
		handleMouseDown,
		handleMouseMove,
		handleMouseUp,
		handleContextMenu,
		handleKeyDown
	};
}
//#endregion
//#region src/hooks/shared/useModeInputHoldRefs.ts
/**
* Owns the hold/drag state used by `createModeInputHandlers`. Hoisted out of
* the factory closure so an in-progress hold or drag survives a `useMemo`
* rebuild during the 350 ms hold-LMB window, e.g. when a worker op completes
* and `elements` updates while the user is still holding the mouse.
*
* The returned bag has stable identity, so consumers can safely list it in
* their `useMemo` deps without forcing extra rebuilds.
*/
function useModeInputHoldRefs() {
	const holdStartRef = useRef(null);
	const lastResolvedRef = useRef(null);
	const dragActiveRef = useRef(false);
	return useMemo(() => ({
		holdStartRef,
		lastResolvedRef,
		dragActiveRef
	}), [
		holdStartRef,
		lastResolvedRef,
		dragActiveRef
	]);
}
//#endregion
//#region src/hooks/useMoveMode.ts
function useMoveMode() {
	const { elements, getObject, updateElementPosition, updateElementRotation, pushUndo, removeElement } = useCadCore();
	const { camera, renderer, scene, controls: orbitControls, forceSceneUpdate, showGroundPlane, navToolActiveRef, selectOtherRef, gridSpacing, gridSnapEnabled, setContinuousRender } = useCadVisualizer();
	const hoverPreviewRef = useRef(null);
	const menuOpenRef = useRef(false);
	const showGroundPlaneRef = useRef(showGroundPlane);
	const gridSpacingRef = useRef(gridSpacing);
	const gridSnapEnabledRef = useRef(gridSnapEnabled);
	const [selectedObject, setSelectedObject] = useState(null);
	const selectedObjectRef = useRef(null);
	const [isRotating, setIsRotating] = useState(false);
	const updateElementPositionRef = useRef(updateElementPosition);
	const updateElementRotationRef = useRef(updateElementRotation);
	const pushUndoRef = useRef(pushUndo);
	const removeElementRef = useRef(removeElement);
	const isRotatingRef = useRef(isRotating);
	const forceSceneUpdateRef = useRef(forceSceneUpdate);
	const isApplyingRef = useRef(false);
	const shiftHeldRef = useRef(false);
	useEffect(() => {
		selectedObjectRef.current = selectedObject;
	}, [selectedObject]);
	useEffect(() => {
		showGroundPlaneRef.current = showGroundPlane;
	}, [showGroundPlane]);
	useEffect(() => {
		gridSpacingRef.current = gridSpacing;
		gridSnapEnabledRef.current = gridSnapEnabled;
	}, [gridSpacing, gridSnapEnabled]);
	useEffect(() => {
		updateElementPositionRef.current = updateElementPosition;
		updateElementRotationRef.current = updateElementRotation;
		pushUndoRef.current = pushUndo;
		removeElementRef.current = removeElement;
		forceSceneUpdateRef.current = forceSceneUpdate;
	}, [
		updateElementPosition,
		updateElementRotation,
		pushUndo,
		removeElement,
		forceSceneUpdate
	]);
	useEffect(() => {
		isRotatingRef.current = isRotating;
	}, [isRotating]);
	const transformControlsRef = useRef(null);
	const dragStartPositionRef = useRef(null);
	useEffect(() => {
		if (!scene || !camera || !renderer) {
			console.error("Scene, camera, or renderer not available");
			return;
		}
		const onDraggingChanged = (event) => {
			const dragging = Boolean(event.value);
			if (dragging) {
				pushUndoRef.current(isRotatingRef.current ? "Rotate" : "Move");
				if (transformControlsRef.current?.object) dragStartPositionRef.current = transformControlsRef.current.object.position.clone();
			} else dragStartPositionRef.current = null;
			if (orbitControls) orbitControls.enabled = !dragging;
			setContinuousRender(dragging);
		};
		const onObjectChange = () => {
			if (selectedObjectRef.current && transformControlsRef.current?.object) {
				const position = new THREE.Vector3();
				transformControlsRef.current.object.getWorldPosition(position);
				if (showGroundPlaneRef.current && gridSnapEnabledRef.current && !shiftHeldRef.current && transformControlsRef.current.mode === "translate" && dragStartPositionRef.current) {
					const gridSize = gridSpacingRef.current;
					const startPos = dragStartPositionRef.current;
					const delta = position.clone().sub(startPos);
					delta.x = Math.round(delta.x / gridSize) * gridSize;
					delta.y = Math.round(delta.y / gridSize) * gridSize;
					const snappedPosition = startPos.clone().add(delta);
					if (!position.equals(snappedPosition)) transformControlsRef.current.object.position.copy(snappedPosition);
					updateElementPositionRef.current(selectedObjectRef.current, snappedPosition);
				} else updateElementPositionRef.current(selectedObjectRef.current, position);
				if (transformControlsRef.current.mode === "rotate" && transformControlsRef.current.object) {
					const obj = transformControlsRef.current.object;
					updateElementRotationRef.current(selectedObjectRef.current, obj.rotation.clone());
				}
			}
		};
		if (transformControlsRef.current) {
			transformControlsRef.current.removeEventListener("dragging-changed", onDraggingChanged);
			transformControlsRef.current.removeEventListener("objectChange", onObjectChange);
			transformControlsRef.current.detach();
			const oldGizmo = transformControlsRef.current.getHelper();
			scene.remove(oldGizmo);
			transformControlsRef.current.dispose();
			transformControlsRef.current = null;
		}
		const transformControls = new TransformControls(camera, renderer.domElement);
		transformControls.setMode("translate");
		transformControls.setSpace("local");
		transformControls.setSize(1.25);
		transformControls.enabled = true;
		transformControls.addEventListener("dragging-changed", onDraggingChanged);
		transformControls.addEventListener("objectChange", onObjectChange);
		const gizmo = transformControls.getHelper();
		gizmo.userData.helperType = "gizmo";
		scene.add(gizmo);
		transformControlsRef.current = transformControls;
		forceSceneUpdate();
		return () => {
			if (transformControlsRef.current) {
				transformControlsRef.current.removeEventListener("dragging-changed", onDraggingChanged);
				transformControlsRef.current.removeEventListener("objectChange", onObjectChange);
				transformControlsRef.current.detach();
				const cleanupGizmo = transformControlsRef.current.getHelper();
				if (scene) scene.remove(cleanupGizmo);
				transformControlsRef.current.dispose();
				transformControlsRef.current = null;
			}
		};
	}, [
		scene,
		camera,
		renderer,
		orbitControls,
		setContinuousRender
	]);
	useEffect(() => {
		const resetToTranslate = () => {
			shiftHeldRef.current = false;
			if (transformControlsRef.current) {
				transformControlsRef.current.setMode("translate");
				transformControlsRef.current.setRotationSnap(null);
				forceSceneUpdateRef.current();
			}
			setIsRotating(false);
		};
		const handleKeyDown = (event) => {
			if (event.key === "Alt") {
				event.preventDefault();
				if (transformControlsRef.current) {
					transformControlsRef.current.setMode("rotate");
					if (showGroundPlaneRef.current && !shiftHeldRef.current) transformControlsRef.current.setRotationSnap(Math.PI / 12);
					else transformControlsRef.current.setRotationSnap(null);
					forceSceneUpdateRef.current();
					setIsRotating(true);
				}
			}
			if (event.key === "Shift") {
				shiftHeldRef.current = true;
				if (transformControlsRef.current) transformControlsRef.current.setRotationSnap(null);
			}
			if (event.key === "Delete" || event.key === "Backspace") {
				const nodeId = selectedObjectRef.current;
				if (nodeId) {
					if (transformControlsRef.current) transformControlsRef.current.detach();
					setSelectedObject(null);
					removeElementRef.current(nodeId);
				}
			}
		};
		const handleKeyUp = (event) => {
			if (event.key === "Alt") resetToTranslate();
			if (event.key === "Shift") {
				shiftHeldRef.current = false;
				if (transformControlsRef.current && transformControlsRef.current.mode === "rotate" && showGroundPlaneRef.current) transformControlsRef.current.setRotationSnap(Math.PI / 12);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		document.addEventListener("keyup", handleKeyUp);
		window.addEventListener("blur", resetToTranslate);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.removeEventListener("keyup", handleKeyUp);
			window.removeEventListener("blur", resetToTranslate);
		};
	}, []);
	useEffect(() => {
		const transformControls = transformControlsRef.current;
		if (!transformControls) return;
		if (!scene) return;
		if (selectedObject) {
			const obj = getObject(selectedObject);
			if (!obj) return;
			transformControls.attach(obj);
			transformControls.visible = true;
			forceSceneUpdate();
		} else {
			transformControls.detach();
			forceSceneUpdate();
		}
	}, [
		selectedObject,
		scene,
		getObject,
		forceSceneUpdate
	]);
	const updateWireframeHelpers = useCallback((nodeId) => {
		if (!nodeId) return;
		const obj = getObject(nodeId);
		if (!obj) return;
		obj.traverse((child) => {
			if (child.userData.helperType === "edge" || child.userData.helperType === "vertex") child.visible = true;
		});
	}, [getObject]);
	const resetObjectVisuals = useCallback((nodeId) => {
		const obj = getObject(nodeId);
		if (!obj) return;
		obj.traverse((child) => {
			if (child.userData.isEdgeOverlay || child.userData.isHelper) return;
			if (child.isMesh) {
				const mat = child.material;
				if (mat && !Array.isArray(mat)) {
					const m = mat;
					m.color.setHex(BODY.default);
					m.polygonOffset = false;
					m.polygonOffsetFactor = 0;
					m.polygonOffsetUnits = 0;
					m.needsUpdate = true;
				}
			}
		});
		obj.traverse((child) => {
			if (child.userData.helperType === "edge" || child.userData.helperType === "vertex") child.visible = false;
		});
	}, [getObject]);
	const applySelectionColor = useCallback((nodeId) => {
		const obj = getObject(nodeId);
		if (!obj) return;
		obj.traverse((child) => {
			if (child.userData.isEdgeOverlay || child.userData.isHelper) return;
			if (child.isMesh) {
				const mat = child.material;
				if (mat && !Array.isArray(mat)) {
					const m = mat;
					m.color.setHex(SELECTION.selected);
					m.polygonOffset = true;
					m.polygonOffsetFactor = -1;
					m.polygonOffsetUnits = -1;
					m.needsUpdate = true;
				}
			}
		});
	}, [getObject]);
	const clearSelection = useCallback(() => {
		if (selectedObjectRef.current) resetObjectVisuals(selectedObjectRef.current);
		if (transformControlsRef.current) transformControlsRef.current.detach();
		setSelectedObject(null);
	}, [resetObjectVisuals]);
	const cleanup = useCallback(() => {
		if (selectedObjectRef.current) resetObjectVisuals(selectedObjectRef.current);
		if (transformControlsRef.current) {
			transformControlsRef.current.detach();
			transformControlsRef.current.getHelper().visible = false;
		}
		setSelectedObject(null);
	}, [resetObjectVisuals]);
	const selectElementById = useCallback((elementId) => {
		if (selectedObjectRef.current && selectedObjectRef.current !== elementId) resetObjectVisuals(selectedObjectRef.current);
		setSelectedObject(elementId);
		applySelectionColor(elementId);
		updateWireframeHelpers(elementId);
	}, [
		applySelectionColor,
		resetObjectVisuals,
		updateWireframeHelpers
	]);
	const restoreHoverPreview = useCallback((nodeId) => {
		const obj = getObject(nodeId);
		if (!obj) return;
		obj.traverse((child) => {
			if (child.userData.isEdgeOverlay || child.userData.isHelper) return;
			if (child.isMesh) {
				const mat = child.material;
				if (mat && !Array.isArray(mat)) mat.depthTest = true;
				child.renderOrder = 0;
			}
		});
		if (!menuOpenRef.current && nodeId === selectedObjectRef.current) applySelectionColor(nodeId);
		else resetObjectVisuals(nodeId);
	}, [
		getObject,
		applySelectionColor,
		resetObjectVisuals
	]);
	const applyHoverPreview = useCallback((item) => {
		const prev = hoverPreviewRef.current;
		if (prev && (!item || item.elementId !== prev)) {
			restoreHoverPreview(prev);
			hoverPreviewRef.current = null;
		}
		if (!item) return;
		const obj = getObject(item.elementId);
		if (!obj) return;
		obj.traverse((child) => {
			if (child.userData.isEdgeOverlay || child.userData.isHelper) return;
			if (child.isMesh) {
				const mat = child.material;
				if (mat && !Array.isArray(mat)) {
					mat.color.setHex(SELECTION.hover);
					mat.depthTest = false;
				}
				child.renderOrder = 999;
			}
		});
		hoverPreviewRef.current = item.elementId;
	}, [getObject, restoreHoverPreview]);
	const { raycasterFromEvent } = useRaycastToObjects();
	const holdRefs = useModeInputHoldRefs();
	const handlers = useMemo(() => createModeInputHandlers({
		pickTargets: (raycaster) => {
			if (transformControlsRef.current?.dragging) return null;
			const picks = collectPicksUnderCursor(raycaster, elements, getObject, { nameFor: makeBodyOrProfileLabel(elements) });
			if (picks.length === 0) return {
				picks: [],
				resolved: { kind: "empty" }
			};
			return {
				picks,
				resolved: {
					kind: "element",
					elementId: picks[0].elementId
				}
			};
		},
		onPickStart: (resolved) => {
			if (resolved.kind === "element") selectElementById(resolved.elementId);
			else clearSelection();
		},
		onPickFromMenu: (item) => {
			menuOpenRef.current = false;
			hoverPreviewRef.current = null;
			selectElementById(item.elementId);
		},
		onMenuOpen: (resolved) => {
			menuOpenRef.current = true;
			if (resolved.kind === "element") resetObjectVisuals(resolved.elementId);
		},
		onMenuCancel: () => {
			menuOpenRef.current = false;
			hoverPreviewRef.current = null;
			if (selectedObjectRef.current) applySelectionColor(selectedObjectRef.current);
		},
		onMenuHover: applyHoverPreview,
		onCancel: () => {},
		enableContextMenu: true
	}, {
		raycasterFromEvent,
		selectOtherRef,
		navToolActiveRef,
		isApplyingRef
	}, holdRefs), [
		elements,
		getObject,
		selectElementById,
		clearSelection,
		resetObjectVisuals,
		applySelectionColor,
		applyHoverPreview,
		raycasterFromEvent,
		selectOtherRef,
		navToolActiveRef,
		holdRefs
	]);
	return [{ selectedObject }, {
		handleMouseDown: handlers.handleMouseDown,
		handleMouseMove: handlers.handleMouseMove,
		handleMouseUp: handlers.handleMouseUp,
		handleContextMenu: handlers.handleContextMenu,
		clearSelection,
		cleanup
	}];
}
//#endregion
//#region src/hooks/useSketchInference.ts
const INFERENCE_PRIORITY = {
	endpoint: 1,
	midpoint: 2,
	center: 3,
	quadrant: 4,
	intersection: 5,
	perpendicular: 6,
	tangent: 7,
	horizontal: 8,
	vertical: 8
};
function useSketchInference() {
	const getPointPosition = useCallback((sketch, pointId) => {
		const point = sketch.primitives.find((p) => p.id === pointId && isSketchPoint(p));
		if (point && isSketchPoint(point)) return new THREE.Vector3(point.x, point.y, 0);
		return null;
	}, []);
	const inferenceCacheRef = useRef({
		sketch: null,
		points: []
	});
	const findInferencePoints = useCallback((sketch) => {
		if (inferenceCacheRef.current.sketch === sketch) return inferenceCacheRef.current.points;
		const points = [];
		for (const primitive of sketch.primitives) if (isSketchPoint(primitive)) points.push({
			position: new THREE.Vector3(primitive.x, primitive.y, 0),
			type: "endpoint",
			sourceId: primitive.id,
			priority: INFERENCE_PRIORITY.endpoint
		});
		else if (isSketchLine(primitive)) {
			const p1 = getPointPosition(sketch, primitive.p1Id);
			const p2 = getPointPosition(sketch, primitive.p2Id);
			if (p1 && p2) {
				points.push({
					position: p1.clone(),
					type: "endpoint",
					sourceId: primitive.id,
					priority: INFERENCE_PRIORITY.endpoint
				});
				points.push({
					position: p2.clone(),
					type: "endpoint",
					sourceId: primitive.id,
					priority: INFERENCE_PRIORITY.endpoint
				});
				const midpoint = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(.5);
				points.push({
					position: midpoint,
					type: "midpoint",
					sourceId: primitive.id,
					priority: INFERENCE_PRIORITY.midpoint
				});
			}
		} else if (isSketchCircle(primitive)) {
			const center = getPointPosition(sketch, primitive.centerId);
			if (center) {
				points.push({
					position: center.clone(),
					type: "center",
					sourceId: primitive.id,
					priority: INFERENCE_PRIORITY.center
				});
				const radius = primitive.radius;
				const quadrantAngles = [
					0,
					Math.PI / 2,
					Math.PI,
					3 * Math.PI / 2
				];
				for (const angle of quadrantAngles) points.push({
					position: new THREE.Vector3(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, 0),
					type: "quadrant",
					sourceId: primitive.id,
					priority: INFERENCE_PRIORITY.quadrant
				});
			}
		} else if (isSketchArc(primitive)) {
			const center = getPointPosition(sketch, primitive.centerId);
			const start = getPointPosition(sketch, primitive.startId);
			const end = getPointPosition(sketch, primitive.endId);
			if (center) points.push({
				position: center.clone(),
				type: "center",
				sourceId: primitive.id,
				priority: INFERENCE_PRIORITY.center
			});
			if (start) points.push({
				position: start.clone(),
				type: "endpoint",
				sourceId: primitive.id,
				priority: INFERENCE_PRIORITY.endpoint
			});
			if (end) points.push({
				position: end.clone(),
				type: "endpoint",
				sourceId: primitive.id,
				priority: INFERENCE_PRIORITY.endpoint
			});
			if (center && start && end) {
				const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
				const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
				let midAngle = (startAngle + endAngle) / 2;
				let angleDiff = endAngle - startAngle;
				if (angleDiff < 0) angleDiff += Math.PI * 2;
				if (angleDiff > Math.PI) midAngle += Math.PI;
				const radius = primitive.radius;
				points.push({
					position: new THREE.Vector3(center.x + Math.cos(midAngle) * radius, center.y + Math.sin(midAngle) * radius, 0),
					type: "midpoint",
					sourceId: primitive.id,
					priority: INFERENCE_PRIORITY.midpoint
				});
			}
		}
		const lines = sketch.primitives.filter(isSketchLine);
		for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
			const line1 = lines[i];
			const line2 = lines[j];
			const p1 = getPointPosition(sketch, line1.p1Id);
			const p2 = getPointPosition(sketch, line1.p2Id);
			const p3 = getPointPosition(sketch, line2.p1Id);
			const p4 = getPointPosition(sketch, line2.p2Id);
			if (p1 && p2 && p3 && p4) {
				const intersection = lineLineIntersection(p1, p2, p3, p4);
				if (intersection) {
					const t1 = getParameterOnLine(p1, p2, intersection);
					const t2 = getParameterOnLine(p3, p4, intersection);
					if (t1 >= -.1 && t1 <= 1.1 && t2 >= -.1 && t2 <= 1.1) points.push({
						position: intersection,
						type: "intersection",
						sourceId: `${line1.id}:${line2.id}`,
						priority: INFERENCE_PRIORITY.intersection
					});
				}
			}
		}
		inferenceCacheRef.current = {
			sketch,
			points
		};
		return points;
	}, [getPointPosition]);
	const findNearestSnap = useCallback((cursorPosition, inferencePoints, snapDistance) => {
		let nearest = null;
		let minDist = snapDistance;
		for (const point of inferencePoints) {
			const dist = cursorPosition.distanceTo(point.position);
			if (dist < minDist) {
				if (!nearest || dist < minDist - .01 || point.priority < nearest.priority) {
					nearest = point;
					minDist = dist;
				}
			}
		}
		return nearest;
	}, []);
	const isHorizontalAligned = useCallback((p1, p2, tolerance) => {
		return Math.abs(p1.y - p2.y) < tolerance;
	}, []);
	const isVerticalAligned = useCallback((p1, p2, tolerance) => {
		return Math.abs(p1.x - p2.x) < tolerance;
	}, []);
	return {
		findInferencePoints,
		findNearestSnap,
		findGuidelines: useCallback((cursorPosition, sketch, chainStartPoint, tolerance) => {
			const guidelines = [];
			if (chainStartPoint) {
				if (isHorizontalAligned(chainStartPoint, cursorPosition, tolerance)) guidelines.push({
					type: "horizontal",
					start: new THREE.Vector3(chainStartPoint.x - 10, chainStartPoint.y, 0),
					end: new THREE.Vector3(cursorPosition.x + 10, chainStartPoint.y, 0),
					color: INFERENCE.guidelineChain
				});
				if (isVerticalAligned(chainStartPoint, cursorPosition, tolerance)) guidelines.push({
					type: "vertical",
					start: new THREE.Vector3(chainStartPoint.x, chainStartPoint.y - 10, 0),
					end: new THREE.Vector3(chainStartPoint.x, cursorPosition.y + 10, 0),
					color: INFERENCE.guidelineChain
				});
			}
			for (const primitive of sketch.primitives) if (isSketchPoint(primitive)) {
				const pointPos = new THREE.Vector3(primitive.x, primitive.y, 0);
				if (isHorizontalAligned(pointPos, cursorPosition, tolerance)) guidelines.push({
					type: "horizontal",
					start: new THREE.Vector3(pointPos.x - 5, pointPos.y, 0),
					end: new THREE.Vector3(cursorPosition.x + 5, pointPos.y, 0),
					color: INFERENCE.guidelinePoint
				});
				if (isVerticalAligned(pointPos, cursorPosition, tolerance)) guidelines.push({
					type: "vertical",
					start: new THREE.Vector3(pointPos.x, pointPos.y - 5, 0),
					end: new THREE.Vector3(pointPos.x, cursorPosition.y + 5, 0),
					color: INFERENCE.guidelinePoint
				});
			}
			return guidelines;
		}, [isHorizontalAligned, isVerticalAligned]),
		isHorizontalAligned,
		isVerticalAligned
	};
}
function lineLineIntersection(p1, p2, p3, p4) {
	const x1 = p1.x, y1 = p1.y;
	const x2 = p2.x, y2 = p2.y;
	const x3 = p3.x, y3 = p3.y;
	const x4 = p4.x, y4 = p4.y;
	const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
	if (Math.abs(denom) < 1e-10) return null;
	const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
	return new THREE.Vector3(x1 + t * (x2 - x1), y1 + t * (y2 - y1), 0);
}
function getParameterOnLine(p1, p2, point) {
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	if (Math.abs(dx) > 1e-10 && Math.abs(dx) >= Math.abs(dy)) return (point.x - p1.x) / dx;
	else if (Math.abs(dy) > 1e-10) return (point.y - p1.y) / dy;
	return 0;
}
//#endregion
//#region src/hooks/useCameraAnimation.ts
/** Unit outward normals for the six cube faces. Shared with the ViewCube widget
*  so its pickable mesh positions always match the resulting camera direction. */
const FACE_NORMALS = {
	right: new THREE.Vector3(1, 0, 0),
	left: new THREE.Vector3(-1, 0, 0),
	top: new THREE.Vector3(0, 1, 0),
	bottom: new THREE.Vector3(0, -1, 0),
	front: new THREE.Vector3(0, 0, 1),
	back: new THREE.Vector3(0, 0, -1)
};
/** Returns the unit direction from origin toward the camera for a given view.
*  For faces this is the face normal; for edges and corners it is the
*  normalized sum of the participating face normals. */
function getViewDirection(view) {
	if (view === "isometric") return new THREE.Vector3(1, 1, 1).normalize();
	const parts = view.split("-");
	const dir = new THREE.Vector3();
	for (const p of parts) dir.add(FACE_NORMALS[p]);
	return dir.normalize();
}
function upForView(view) {
	if (view === "top") return new THREE.Vector3(0, 0, -1);
	if (view === "bottom") return new THREE.Vector3(0, 0, 1);
	return new THREE.Vector3(0, 1, 0);
}
/** Ease-out quadratic: decelerating to zero velocity */
function easeOutQuad(t) {
	return t * (2 - t);
}
function useCameraAnimation(camera, controls) {
	const animFrameRef = useRef(null);
	const [isAnimating, setIsAnimating] = useState(false);
	const cancelAnimation = useCallback(() => {
		if (animFrameRef.current !== null) {
			cancelAnimationFrame(animFrameRef.current);
			animFrameRef.current = null;
		}
		setIsAnimating(false);
	}, []);
	return {
		animateToView: useCallback((viewName) => {
			if (!camera || !controls) return;
			cancelAnimation();
			const pivot = controls.target.clone();
			const currentDistance = Math.max(camera.position.distanceTo(pivot), CAMERA_MIN_DISTANCE);
			const startPos = camera.position.clone();
			const endPos = pivot.clone().add(getViewDirection(viewName).multiplyScalar(currentDistance));
			const startUp = camera.up.clone();
			const endUp = upForView(viewName);
			const startTime = performance.now();
			const duration = 400;
			const onControlChange = () => {
				cancelAnimation();
				controls.removeEventListener("start", onControlChange);
			};
			controls.addEventListener("start", onControlChange);
			setIsAnimating(true);
			const animate = (now) => {
				const elapsed = now - startTime;
				const t = Math.min(elapsed / duration, 1);
				const eased = easeOutQuad(t);
				camera.position.lerpVectors(startPos, endPos, eased);
				camera.up.copy(startUp).lerp(endUp, eased).normalize();
				controls.update();
				if (t < 1) animFrameRef.current = requestAnimationFrame(animate);
				else {
					setIsAnimating(false);
					controls.removeEventListener("start", onControlChange);
				}
			};
			animFrameRef.current = requestAnimationFrame(animate);
		}, [
			camera,
			controls,
			cancelAnimation
		]),
		fitAll: useCallback((elements, getObject) => {
			if (!camera || !controls || elements.length === 0) return;
			cancelAnimation();
			const box = new THREE.Box3();
			let hasGeometry = false;
			for (const el of elements) {
				const obj = getObject(el.nodeId);
				if (obj) {
					box.expandByObject(obj);
					hasGeometry = true;
				}
			}
			if (!hasGeometry) return;
			const center = new THREE.Vector3();
			box.getCenter(center);
			const size = new THREE.Vector3();
			box.getSize(size);
			const maxDim = Math.max(size.x, size.y, size.z, 1);
			let distance;
			if (camera instanceof THREE.PerspectiveCamera) {
				const fov = camera.fov * (Math.PI / 180);
				distance = maxDim / (2 * Math.tan(fov / 2)) * 1.5;
			} else {
				distance = camera.position.distanceTo(controls.target);
				const ortho = camera;
				const aspect = window.innerWidth / window.innerHeight;
				const halfHeight = maxDim / 2 * 1.5;
				ortho.left = -halfHeight * aspect;
				ortho.right = halfHeight * aspect;
				ortho.top = halfHeight;
				ortho.bottom = -halfHeight;
				ortho.updateProjectionMatrix();
			}
			const startPos = camera.position.clone();
			const direction = camera.position.clone().sub(controls.target).normalize();
			const endPos = center.clone().add(direction.multiplyScalar(distance));
			const startTarget = controls.target.clone();
			const endTarget = center.clone();
			const startTime = performance.now();
			const duration = 400;
			setIsAnimating(true);
			const animate = (now) => {
				const elapsed = now - startTime;
				const t = Math.min(elapsed / duration, 1);
				const eased = easeOutQuad(t);
				camera.position.lerpVectors(startPos, endPos, eased);
				controls.target.lerpVectors(startTarget, endTarget, eased);
				controls.update();
				if (t < 1) animFrameRef.current = requestAnimationFrame(animate);
				else setIsAnimating(false);
			};
			animFrameRef.current = requestAnimationFrame(animate);
		}, [
			camera,
			controls,
			cancelAnimation
		]),
		isAnimating
	};
}
//#endregion
//#region src/hooks/useCombineMode.ts
function useCombineMode() {
	const { elements, getObject, combineSelectedElements } = useCadCore();
	const { navToolActiveRef, selectOtherRef, forceSceneUpdate } = useCadVisualizer();
	const [operationType, setOperationTypeRaw] = useState("join");
	const [targetBody, setTargetBody] = useState(null);
	const [toolBodies, setToolBodies] = useState([]);
	const [keepTools, setKeepTools] = useState(false);
	const hoveredRef = useRef(null);
	const isApplyingRef = useRef(false);
	const targetBodyRef = useRef(targetBody);
	targetBodyRef.current = targetBody;
	const toolBodiesRef = useRef(toolBodies);
	toolBodiesRef.current = toolBodies;
	const setOperationType = useCallback((type) => {
		setOperationTypeRaw(type);
		if (type === "join") setKeepTools(false);
	}, []);
	const canCombine = targetBody !== null && toolBodies.length >= 1;
	const setElementColor = useCallback((nodeId, color) => {
		const obj = getObject(nodeId);
		if (!obj) return;
		obj.traverse((child) => {
			if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) child.material.color.set(color);
		});
		forceSceneUpdate();
	}, [getObject, forceSceneUpdate]);
	const resetAllColors = useCallback(() => {
		if (targetBodyRef.current) setElementColor(targetBodyRef.current, BODY.default);
		toolBodiesRef.current.forEach((id) => setElementColor(id, BODY.default));
		if (hoveredRef.current) {
			setElementColor(hoveredRef.current, BODY.default);
			hoveredRef.current = null;
		}
	}, [setElementColor]);
	const resetSelection = useCallback(() => {
		resetAllColors();
		setTargetBody(null);
		setToolBodies([]);
	}, [resetAllColors]);
	const cleanup = resetSelection;
	const cleanupRef = useRef(cleanup);
	cleanupRef.current = cleanup;
	useEffect(() => () => cleanupRef.current(), []);
	const applyPick = useCallback((elementId) => {
		const currentTarget = targetBodyRef.current;
		const currentTools = toolBodiesRef.current;
		if (!currentTarget) {
			setTargetBody(elementId);
			setElementColor(elementId, COMBINE.targetHighlight);
		} else if (elementId === currentTarget) {
			setElementColor(elementId, BODY.default);
			setTargetBody(null);
		} else if (currentTools.includes(elementId)) {
			setElementColor(elementId, BODY.default);
			setToolBodies((prev) => prev.filter((id) => id !== elementId));
		} else {
			setToolBodies((prev) => [...prev, elementId]);
			setElementColor(elementId, COMBINE.toolHighlight);
		}
	}, [setElementColor]);
	const applyHoverPreview = useCallback((item) => {
		const currentTarget = targetBodyRef.current;
		const currentTools = toolBodiesRef.current;
		if (item) {
			const elementId = nodeId(item.elementId);
			if (elementId !== currentTarget && !currentTools.includes(elementId)) setElementColor(elementId, !currentTarget ? COMBINE.targetHover : COMBINE.toolHover);
		} else elements.forEach((el) => {
			if (el.nodeId !== currentTarget && !currentTools.includes(el.nodeId)) setElementColor(el.nodeId, BODY.default);
		});
	}, [elements, setElementColor]);
	const { raycasterFromEvent } = useRaycastToObjects();
	const holdRefs = useModeInputHoldRefs();
	const handlers = useMemo(() => createModeInputHandlers({
		pickTargets: (raycaster) => {
			const picks = collectPicksUnderCursor(raycaster, elements, getObject, {
				filter: isElement3D,
				nameFor: makeBodyOrProfileLabel(elements)
			});
			if (picks.length === 0) return null;
			const elementId = nodeId(picks[0].elementId);
			return {
				picks,
				resolved: {
					elementId,
					justAppliedTo: elementId
				}
			};
		},
		hoverTargets: (raycaster) => {
			const picks = collectPicksUnderCursor(raycaster, elements, getObject, { filter: isElement3D });
			if (picks.length === 0) return null;
			const elementId = nodeId(picks[0].elementId);
			return {
				elementId,
				justAppliedTo: elementId
			};
		},
		onPickStart: ({ elementId }) => {
			applyPick(elementId);
		},
		onPickFromMenu: (item) => {
			applyPick(nodeId(item.elementId));
		},
		onHover: (resolved) => {
			const hoveredId = resolved?.elementId ?? null;
			const prevHovered = hoveredRef.current;
			const currentTarget = targetBodyRef.current;
			const currentTools = toolBodiesRef.current;
			if (prevHovered && prevHovered !== hoveredId) {
				if (prevHovered !== currentTarget && !currentTools.includes(prevHovered)) setElementColor(prevHovered, BODY.default);
			}
			if (hoveredId && hoveredId !== currentTarget && !currentTools.includes(hoveredId)) setElementColor(hoveredId, !currentTarget ? COMBINE.targetHover : COMBINE.toolHover);
			hoveredRef.current = hoveredId;
			return null;
		},
		onMenuHover: applyHoverPreview,
		onMenuOpen: ({ justAppliedTo }) => applyPick(justAppliedTo),
		onMenuCancel: ({ justAppliedTo }) => applyPick(justAppliedTo),
		onCancel: () => {},
		enableContextMenu: true
	}, {
		raycasterFromEvent,
		selectOtherRef,
		navToolActiveRef,
		isApplyingRef
	}, holdRefs), [
		elements,
		getObject,
		applyPick,
		applyHoverPreview,
		setElementColor,
		raycasterFromEvent,
		selectOtherRef,
		navToolActiveRef,
		holdRefs
	]);
	const performCombine = useCallback(async () => {
		if (!canCombine || !targetBody) return;
		const currentToolBodies = [...toolBodies];
		const result = await combineSelectedElements(operationType, {
			targetId: targetBody,
			toolIds: currentToolBodies,
			keepTools
		});
		if (result !== true) {
			notify(`${OP_LABEL[operationType]} failed: ${typeof result === "string" ? result : "unknown error"}`, "error");
			resetAllColors();
		} else if (result === true && keepTools) currentToolBodies.forEach((id) => setElementColor(id, BODY.default));
		setTargetBody(null);
		setToolBodies([]);
		hoveredRef.current = null;
		forceSceneUpdate();
	}, [
		canCombine,
		targetBody,
		toolBodies,
		operationType,
		keepTools,
		combineSelectedElements,
		forceSceneUpdate,
		resetAllColors,
		setElementColor
	]);
	return {
		handleCombineMouseDown: handlers.handleMouseDown,
		handleCombineMouseMove: handlers.handleMouseMove,
		handleCombineMouseUp: handlers.handleMouseUp,
		handleCombineContextMenu: handlers.handleContextMenu,
		performCombine,
		canCombine,
		operationType,
		setOperationType,
		targetBody,
		toolBodies,
		keepTools,
		setKeepTools,
		resetSelection,
		cleanup
	};
}
//#endregion
//#region src/hooks/extrude/extrude-helpers.ts
const NORMAL_TOLERANCE = .001;
function normalsEqual(a, b) {
	return Math.abs(a.x - b.x) < NORMAL_TOLERANCE && Math.abs(a.y - b.y) < NORMAL_TOLERANCE && Math.abs(a.z - b.z) < NORMAL_TOLERANCE;
}
/**
* Get the normal direction of a flat BRep (the axis it's flat along).
* If `element` carries a sketchPlane, uses that normal directly.
* Otherwise falls back to detecting the flat axis from vertex ranges.
*/
function getFlatNormal(brep, element) {
	if (element?.sketchPlane) return element.sketchPlane.normal.clone();
	switch (flatAxis(brep)) {
		case "x": return new THREE.Vector3(1, 0, 0);
		case "y": return new THREE.Vector3(0, 1, 0);
		default: return new THREE.Vector3(0, 0, 1);
	}
}
/**
* Build a single arrow handle (shaft cylinder + head cone) as a THREE.Group.
* Caller adds it to the scene and tracks it in the arrowHandlesRef.
*/
function buildArrowGeometry(origin, direction, length, shaftRadius, headRadius, headLength, color, opacity, handleDirection) {
	const group = new THREE.Group();
	group.userData.handleType = "extrudeArrow";
	group.userData.direction = handleDirection;
	const material = new THREE.MeshBasicMaterial({
		color,
		transparent: opacity < 1,
		opacity
	});
	const shaftLength = length - headLength;
	const shaftGeometry = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 16);
	const shaft = new THREE.Mesh(shaftGeometry, material);
	shaft.userData.handleType = "extrudeArrow";
	shaft.userData.direction = handleDirection;
	shaft.position.copy(direction.clone().multiplyScalar(shaftLength / 2));
	const quaternion = new THREE.Quaternion();
	quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
	shaft.quaternion.copy(quaternion);
	group.add(shaft);
	const headGeometry = new THREE.ConeGeometry(headRadius, headLength, 16);
	const head = new THREE.Mesh(headGeometry, material);
	head.userData.handleType = "extrudeArrow";
	head.userData.direction = handleDirection;
	head.position.copy(direction.clone().multiplyScalar(shaftLength + headLength / 2));
	head.quaternion.copy(quaternion);
	group.add(head);
	group.position.copy(origin);
	return group;
}
/**
* Build the directional scale matrix M = I + (s-1)(n⊗n) with translation `offset`,
* applied to a unit-extrusion mesh to scale it along `normal` by factor `s` while
* leaving the orthogonal directions untouched.
*/
function buildDirectionalScaleMatrix(normal, s, offset) {
	const nx = normal.x, ny = normal.y, nz = normal.z;
	const f = s - 1;
	const m = new THREE.Matrix4();
	m.set(1 + f * nx * nx, f * nx * ny, f * nx * nz, offset.x, f * ny * nx, 1 + f * ny * ny, f * ny * nz, offset.y, f * nz * nx, f * nz * ny, 1 + f * nz * nz, offset.z, 0, 0, 0, 1);
	return m;
}
/**
* Project a normal vector to screen-space pixel direction at the given world origin.
* Returns the screen-space direction vector (px) and its length.
*/
function projectNormalToScreenSpace(camera, renderer, origin, normal) {
	const normalEnd = origin.clone().add(normal);
	const rect = renderer.domElement.getBoundingClientRect();
	const originNDC = origin.clone().project(camera);
	const normalEndNDC = normalEnd.clone().project(camera);
	const screenDir = new THREE.Vector2((normalEndNDC.x - originNDC.x) * rect.width / 2, -(normalEndNDC.y - originNDC.y) * rect.height / 2);
	return {
		screenDir,
		screenDirLen: screenDir.length()
	};
}
/**
* Convert a mouse pixel delta into projected extrusion depth along the screen-space
* normal direction. When the normal points roughly at the camera (screenDirLen < 1),
* falls back to vertical mouse movement.
*/
function calculateExtrusionDepthFromMouse(screenDir, screenDirLen, mouseDeltaPx) {
	if (screenDirLen < 1) return -mouseDeltaPx.y * .02;
	const screenDirNorm = screenDir.clone().normalize();
	return mouseDeltaPx.dot(screenDirNorm) / screenDirLen;
}
//#endregion
//#region src/hooks/extrude/hooks/useExtrudeApply.ts
function useExtrudeApply({ stateBag, preview }) {
	const { elements, getObject, updateElementBrep, removeElement } = useCadCore();
	const { forceSceneUpdate } = useCadVisualizer();
	const { state, originalBrepRef } = stateBag;
	const { cachedPreviewGeometryRef } = preview;
	return {
		applyExtrusion: useCallback(async (depth, direction) => {
			if (state.selectedElements.length === 0) return;
			let ocDirection;
			switch (direction) {
				case "up":
					ocDirection = 1;
					break;
				case "down":
					ocDirection = -1;
					break;
				case "symmetric":
					ocDirection = 1;
					break;
				default: ocDirection = 1;
			}
			const isSymmetric = direction === "symmetric";
			for (const nodeId of state.selectedElements) {
				const element = elements.find((el) => el.nodeId === nodeId);
				const origBrep = originalBrepRef.current.get(nodeId);
				if (!element || !origBrep) continue;
				try {
					const normalVec = toVec3(getFlatNormal(origBrep, element));
					const extrusionResult = await extrudeBRep(origBrep, depth, ocDirection, normalVec, element.occBrep, isSymmetric);
					if (!extrusionResult.ok) {
						notify(`Extrusion failed: ${extrusionResult.reason}`, "error");
						continue;
					}
					const value = extrusionResult.value;
					const newPosition = new THREE.Vector3(element.position.x + value.positionOffset.x, element.position.y + value.positionOffset.y, element.position.z + value.positionOffset.z);
					updateElementBrep(nodeId, value.brep, newPosition, { type: "extrude" }, value.edgeGeometry, value.occBrep, value.faceGeometry, value.vertexPositions);
				} catch (error) {
					console.error("Extrusion failed for", nodeId, error);
					notify(`Extrusion failed: ${error instanceof Error ? error.message : "unknown error"}`, "error");
				}
			}
			forceSceneUpdate();
			originalBrepRef.current.clear();
			cachedPreviewGeometryRef.current.clear();
		}, [
			state.selectedElements,
			elements,
			updateElementBrep,
			forceSceneUpdate,
			originalBrepRef,
			cachedPreviewGeometryRef
		]),
		applyCutExtrusion: useCallback(async (depth, direction) => {
			if (state.selectedElements.length === 0) return;
			const client = OccWorkerClient.getInstance();
			let ocDirection;
			switch (direction) {
				case "down":
					ocDirection = -1;
					break;
				default: ocDirection = 1;
			}
			const isSymmetric = direction === "symmetric";
			const targetStates = /* @__PURE__ */ new Map();
			for (const nodeId of state.selectedElements) {
				const profileElement = elements.find((el) => el.nodeId === nodeId);
				const origBrep = originalBrepRef.current.get(nodeId);
				if (!profileElement || !origBrep) continue;
				try {
					const normal = getFlatNormal(origBrep, profileElement);
					const normalVec = toVec3(normal);
					const extrusionResult = await extrudeBRep(origBrep, depth, ocDirection, normalVec, profileElement.occBrep, isSymmetric);
					if (!extrusionResult.ok) {
						notify(`Cut extrusion failed: ${extrusionResult.reason}`, "error");
						continue;
					}
					const extValue = extrusionResult.value;
					const toolWorldPos = new THREE.Vector3(profileElement.position.x + extValue.positionOffset.x, profileElement.position.y + extValue.positionOffset.y, profileElement.position.z + extValue.positionOffset.z);
					let targetElement = null;
					const sourceId = profileElement.sketchPlane?.sourceElementId;
					if (sourceId) {
						const sourceEl = elements.find((el) => el.nodeId === sourceId);
						if (sourceEl && isElement3D(sourceEl)) targetElement = sourceEl;
					}
					if (!targetElement) {
						const toolBox = new THREE.Box3();
						for (const v of extValue.brep.vertices) toolBox.expandByPoint(new THREE.Vector3(v.x + toolWorldPos.x, v.y + toolWorldPos.y, v.z + toolWorldPos.z));
						const expandVec = normal.clone().multiplyScalar(depth * 2);
						toolBox.expandByVector(new THREE.Vector3(Math.abs(expandVec.x), Math.abs(expandVec.y), Math.abs(expandVec.z)));
						for (const el of elements) {
							if (state.selectedElements.includes(el.nodeId)) continue;
							if (!isElement3D(el)) continue;
							const targetObj = getObject(el.nodeId);
							if (targetObj) {
								const targetBox = new THREE.Box3().setFromObject(targetObj);
								if (toolBox.intersectsBox(targetBox)) {
									targetElement = el;
									break;
								}
							}
						}
					}
					if (!targetElement) {
						notify("No intersecting body found for cut", "error");
						continue;
					}
					const existing = targetStates.get(targetElement.nodeId);
					const tgtState = existing ?? {
						brepJson: targetElement.brep.toJSON(),
						position: toVec3(targetElement.position),
						occBrep: targetElement.occBrep,
						lastResult: null,
						consumedProfileIds: []
					};
					if (!existing) targetStates.set(targetElement.nodeId, tgtState);
					const booleanResult = await client.send({
						type: "boolean",
						payload: {
							operation: "difference",
							operands: [{
								brepJson: tgtState.brepJson,
								position: tgtState.position,
								occBrep: tgtState.occBrep
							}, {
								brepJson: extValue.brep.toJSON(),
								position: toVec3(toolWorldPos),
								occBrep: extValue.occBrep
							}]
						}
					});
					tgtState.brepJson = booleanResult.brepJson;
					tgtState.position = booleanResult.position;
					tgtState.occBrep = booleanResult.occBrep;
					tgtState.lastResult = booleanResult;
					tgtState.consumedProfileIds.push(nodeId);
				} catch (error) {
					console.error("Cut extrusion failed for", nodeId, error);
					notify(`Cut extrusion failed: ${error instanceof Error ? error.message : "unknown error"}`, "error");
				}
			}
			targetStates.forEach((tgtState, targetId) => {
				if (!tgtState.lastResult) return;
				const resultBrep = Brep.fromJSON(tgtState.lastResult.brepJson);
				const worldCenter = new THREE.Vector3(tgtState.lastResult.position.x, tgtState.lastResult.position.y, tgtState.lastResult.position.z);
				const edgeGeometry = tgtState.lastResult.edgePositions ? reconstructEdgeGeometry(tgtState.lastResult.edgePositions) : void 0;
				const faceGeometry = tgtState.lastResult.faceGeometry ? reconstructFaceGeometry(tgtState.lastResult.faceGeometry) : void 0;
				const consumed = tgtState.consumedProfileIds;
				const lastConsumed = consumed[consumed.length - 1];
				const earlierConsumed = consumed.slice(0, -1);
				updateElementBrep(targetId, resultBrep, worldCenter, {
					type: "difference",
					...lastConsumed !== void 0 && { consumedElementId: lastConsumed }
				}, edgeGeometry, tgtState.lastResult.occBrep, faceGeometry, tgtState.lastResult.vertexPositions);
				earlierConsumed.forEach((id) => removeElement(id));
			});
			forceSceneUpdate();
			originalBrepRef.current.clear();
			cachedPreviewGeometryRef.current.clear();
		}, [
			state.selectedElements,
			elements,
			getObject,
			updateElementBrep,
			removeElement,
			forceSceneUpdate,
			originalBrepRef,
			cachedPreviewGeometryRef
		])
	};
}
//#endregion
//#region src/hooks/extrude/hooks/useExtrudeDimension.ts
function useExtrudeDimension({ stateBag, preview, apply }) {
	const { elements } = useCadCore();
	const { state, setState, originalBrepRef, tintElement, cleanupHandles } = stateBag;
	const { cleanupPreview, restoreOriginalMesh, updatePreview, cachedPreviewGeometryRef } = preview;
	const { applyExtrusion, applyCutExtrusion } = apply;
	return {
		handleDimensionSubmit: useCallback(async (value) => {
			if (value > 0 && state.selectedElements.length > 0) {
				for (const id of state.selectedElements) {
					if (originalBrepRef.current.has(id)) continue;
					const element = elements.find((el) => el.nodeId === id);
					if (element) originalBrepRef.current.set(id, element.brep);
				}
				cleanupPreview();
				restoreOriginalMesh();
				if (state.operationType === "cut") await applyCutExtrusion(value, state.activeDirection || "up");
				else await applyExtrusion(value, state.activeDirection || "up");
			}
			state.selectedElements.forEach((id) => tintElement(id, BODY.default));
			setState((prev) => ({
				...prev,
				showDimensionInput: false,
				activeDirection: null,
				extrusionDepth: 0,
				selectedElements: []
			}));
			cleanupHandles();
		}, [
			state.selectedElements,
			state.activeDirection,
			state.operationType,
			elements,
			originalBrepRef,
			applyExtrusion,
			applyCutExtrusion,
			cleanupHandles,
			cleanupPreview,
			restoreOriginalMesh,
			tintElement,
			setState
		]),
		handleDimensionChange: useCallback((value) => {
			if (state.selectedElements.length === 0 || !state.activeDirection) return;
			setState((prev) => ({
				...prev,
				extrusionDepth: value
			}));
			updatePreview(value, state.activeDirection);
		}, [
			state.selectedElements,
			state.activeDirection,
			updatePreview,
			setState
		]),
		handleDimensionCancel: useCallback(() => {
			cleanupPreview();
			restoreOriginalMesh();
			setState((prev) => ({
				...prev,
				showDimensionInput: false,
				isExtruding: false,
				activeDirection: null,
				extrusionDepth: 0
			}));
			originalBrepRef.current.clear();
			cachedPreviewGeometryRef.current.clear();
		}, [
			cleanupPreview,
			restoreOriginalMesh,
			setState,
			originalBrepRef,
			cachedPreviewGeometryRef
		])
	};
}
//#endregion
//#region src/hooks/extrude/hooks/useExtrudeInputHandlers.ts
function useExtrudeInputHandlers({ stateBag, preview }) {
	const { elements, getObject } = useCadCore();
	const { camera, renderer, getMouseIntersection, navToolActiveRef } = useCadVisualizer();
	const { raycasterFromEvent, raycastToObjects } = useRaycastToObjects();
	const { state, setState, startPointRef, startScreenRef, originalBrepRef, arrowHandlesRef, hoveredElementRef, previewBuildVersionRef, tintElement, cleanupHandles, createArrowHandles, cleanupHoverOverlay } = stateBag;
	const { buildCachedPreviewGeometry, updatePreview, cachedPreviewGeometryRef, cleanupPreview, restoreOriginalMesh } = preview;
	const selectedElementsRef = useRef(state.selectedElements);
	selectedElementsRef.current = state.selectedElements;
	const isExtrudingRef = useRef(state.isExtruding);
	isExtrudingRef.current = state.isExtruding;
	const activeDirectionRef = useRef(state.activeDirection);
	activeDirectionRef.current = state.activeDirection;
	const isApplyingRef = useRef(false);
	const holdRefs = useModeInputHoldRefs();
	const beginArrowDrag = useCallback((direction, event) => {
		const activeDir = event.shiftKey ? "symmetric" : direction;
		startPointRef.current = getMouseIntersection(event);
		startScreenRef.current = {
			x: event.clientX,
			y: event.clientY
		};
		const selectedEls = selectedElementsRef.current.map((id) => elements.find((el) => el.nodeId === id)).filter((el) => !!el);
		if (selectedEls.length === 0) return false;
		let screenPos = {
			x: 0,
			y: 0
		};
		if (camera && renderer) {
			const combined = new THREE.Box3();
			selectedEls.forEach((el) => {
				const obj = getObject(el.nodeId);
				if (obj) combined.expandByObject(obj);
			});
			const center = new THREE.Vector3();
			combined.getCenter(center);
			center.project(camera);
			const rect2 = renderer.domElement.getBoundingClientRect();
			screenPos = {
				x: (center.x + 1) / 2 * rect2.width + rect2.left,
				y: (-center.y + 1) / 2 * rect2.height + rect2.top - 50
			};
		}
		setState((prev) => ({
			...prev,
			isExtruding: true,
			activeDirection: activeDir,
			extrusionDepth: 1,
			showDimensionInput: true,
			dimensionInputPosition: screenPos
		}));
		originalBrepRef.current.clear();
		cachedPreviewGeometryRef.current.clear();
		selectedEls.forEach((el) => {
			originalBrepRef.current.set(el.nodeId, el.brep);
		});
		const buildVersion = ++previewBuildVersionRef.current;
		Promise.all(selectedEls.map(async (el) => {
			const geom = await buildCachedPreviewGeometry(el.brep, el);
			if (previewBuildVersionRef.current !== buildVersion) return;
			if (geom) cachedPreviewGeometryRef.current.set(el.nodeId, geom);
		})).then(() => {
			if (previewBuildVersionRef.current !== buildVersion) return;
			if (originalBrepRef.current.size === 0) return;
			updatePreview(1, activeDir);
		});
		return true;
	}, [
		elements,
		getObject,
		getMouseIntersection,
		camera,
		renderer,
		startPointRef,
		startScreenRef,
		setState,
		originalBrepRef,
		cachedPreviewGeometryRef,
		previewBuildVersionRef,
		buildCachedPreviewGeometry,
		updatePreview
	]);
	const handleProfilePick = useCallback((el, event) => {
		const additive = event.ctrlKey || event.metaKey || event.shiftKey;
		const already = selectedElementsRef.current.includes(el.nodeId);
		if (additive && already) {
			tintElement(el.nodeId, BODY.default);
			const newSelection = selectedElementsRef.current.filter((id) => id !== el.nodeId);
			setState((prev) => ({
				...prev,
				selectedElements: newSelection,
				showDimensionInput: false
			}));
			if (newSelection.length === 0) cleanupHandles();
			else createArrowHandles(newSelection);
		} else if (additive && !already) {
			const firstId = selectedElementsRef.current[0];
			if (firstId) {
				const firstEl = elements.find((e) => e.nodeId === firstId);
				const candNormal = getFlatNormal(el.brep, el);
				const firstNormal = firstEl ? getFlatNormal(firstEl.brep, firstEl) : null;
				if (firstNormal && !normalsEqual(candNormal, firstNormal)) {
					notify("All selected profiles must share the same normal", "error");
					return;
				}
			}
			tintElement(el.nodeId, SELECTION.selected);
			const newSelection = [...selectedElementsRef.current, el.nodeId];
			setState((prev) => ({
				...prev,
				selectedElements: newSelection,
				showDimensionInput: false
			}));
			createArrowHandles(newSelection);
		} else {
			selectedElementsRef.current.forEach((id) => tintElement(id, BODY.default));
			tintElement(el.nodeId, SELECTION.selected);
			setState((prev) => ({
				...prev,
				selectedElements: [el.nodeId],
				showDimensionInput: false
			}));
			createArrowHandles([el.nodeId]);
		}
	}, [
		elements,
		tintElement,
		setState,
		cleanupHandles,
		createArrowHandles
	]);
	const handleEmptyPick = useCallback(() => {
		selectedElementsRef.current.forEach((id) => tintElement(id, BODY.default));
		setState((prev) => ({
			...prev,
			selectedElements: [],
			showDimensionInput: false
		}));
		cleanupHandles();
	}, [
		tintElement,
		setState,
		cleanupHandles
	]);
	const onExtrudeDrag = useCallback((event) => {
		if (!isExtrudingRef.current || !startPointRef.current || !activeDirectionRef.current) return;
		if (!camera || !renderer || !startScreenRef.current) return;
		event.preventDefault();
		event.stopPropagation();
		const firstId = selectedElementsRef.current[0];
		const firstEl = firstId ? elements.find((el) => el.nodeId === firstId) : void 0;
		if (!firstEl) return;
		const normal = getFlatNormal(firstEl.brep, firstEl);
		const combined = new THREE.Box3();
		for (const id of selectedElementsRef.current) {
			const obj = getObject(id);
			if (obj) combined.expandByObject(obj);
		}
		const origin = new THREE.Vector3();
		if (combined.isEmpty()) origin.copy(firstEl.position);
		else combined.getCenter(origin);
		const { screenDir, screenDirLen } = projectNormalToScreenSpace(camera, renderer, origin, normal);
		const projectedDelta = calculateExtrusionDepthFromMouse(screenDir, screenDirLen, new THREE.Vector2(event.clientX - startScreenRef.current.x, event.clientY - startScreenRef.current.y));
		const dir = activeDirectionRef.current;
		let extrusionDepth;
		if (dir === "up") extrusionDepth = Math.max(EXTRUSION_MIN_DEPTH_MM, projectedDelta);
		else if (dir === "down") extrusionDepth = Math.max(EXTRUSION_MIN_DEPTH_MM, -projectedDelta);
		else extrusionDepth = Math.max(EXTRUSION_MIN_DEPTH_MM, Math.abs(projectedDelta));
		if (!(event.ctrlKey || event.metaKey)) extrusionDepth = Math.round(extrusionDepth * 4) / 4;
		setState((prev) => ({
			...prev,
			extrusionDepth
		}));
		updatePreview(extrusionDepth, dir);
	}, [
		camera,
		renderer,
		elements,
		getObject,
		setState,
		startPointRef,
		startScreenRef,
		updatePreview
	]);
	const onExtrudeDragEnd = useCallback(() => {
		setState((prev) => ({
			...prev,
			isExtruding: false
		}));
		startPointRef.current = null;
		startScreenRef.current = null;
	}, [
		setState,
		startPointRef,
		startScreenRef
	]);
	const handlers = useMemo(() => createModeInputHandlers({
		pickTargets: (raycaster, event) => {
			const handleObjects = [];
			arrowHandlesRef.current.forEach((handle) => {
				handle.traverse((child) => {
					if (child instanceof THREE.Mesh) handleObjects.push(child);
				});
			});
			const handleIntersects = raycastToObjects(event, handleObjects);
			if (handleIntersects.length > 0) return {
				picks: [],
				resolved: {
					kind: "arrow",
					direction: handleIntersects[0].object.userData.direction
				}
			};
			const flatElements = elements.filter((el) => isFlat(el.brep) || el.sketchPlane);
			const meshes = collectPickableMeshes(flatElements, getObject);
			const intersects = raycaster.intersectObjects(meshes, false);
			if (intersects.length === 0) return {
				picks: [],
				resolved: { kind: "empty" }
			};
			const pickedObject = intersects[0].object;
			for (const el of flatElements) {
				const obj = getObject(el.nodeId);
				if (obj && isDescendantOf(pickedObject, obj)) return {
					picks: [],
					resolved: {
						kind: "profile",
						elementId: el.nodeId
					}
				};
			}
			return {
				picks: [],
				resolved: { kind: "empty" }
			};
		},
		hoverTargets: (raycaster, event) => {
			if (isExtrudingRef.current || selectedElementsRef.current.length > 0) return null;
			const flatElements = elements.filter((el) => isFlat(el.brep) || el.sketchPlane);
			const intersects = raycastToObjects(event, collectPickableMeshes(flatElements, getObject), false);
			if (intersects.length === 0) return null;
			const pickedObject = intersects[0].object;
			for (const el of flatElements) {
				const obj = getObject(el.nodeId);
				if (obj && isDescendantOf(pickedObject, obj)) return {
					kind: "profile",
					elementId: el.nodeId
				};
			}
			return null;
		},
		onPickStart: (resolved, _picks, event) => {
			if (resolved.kind === "arrow") {
				beginArrowDrag(resolved.direction, event);
				return;
			}
			if (resolved.kind === "profile") {
				const el = elements.find((e) => e.nodeId === resolved.elementId);
				if (el) handleProfilePick(el, event);
				return;
			}
			handleEmptyPick();
		},
		onPickFromMenu: () => {},
		onHover: (resolved) => {
			if (!resolved || resolved.kind !== "profile") {
				if (hoveredElementRef.current) cleanupHoverOverlay();
				return null;
			}
			const foundId = resolved.elementId;
			if (foundId !== hoveredElementRef.current) {
				cleanupHoverOverlay();
				hoveredElementRef.current = foundId;
				const obj = getObject(foundId);
				if (obj) obj.traverse((child) => {
					if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay) child.material.color.set(SELECTION.hover);
				});
			}
			return null;
		},
		onCancel: () => {
			previewBuildVersionRef.current++;
			setState((prev) => {
				prev.selectedElements.forEach((id) => tintElement(id, BODY.default));
				return {
					...prev,
					isExtruding: false,
					showDimensionInput: false,
					activeDirection: null,
					extrusionDepth: 0,
					selectedElements: []
				};
			});
			cleanupHandles();
			cleanupPreview();
			restoreOriginalMesh();
			originalBrepRef.current.clear();
			cachedPreviewGeometryRef.current.clear();
		},
		onDragStart: (resolved) => resolved.kind === "arrow",
		onDrag: onExtrudeDrag,
		onDragEnd: onExtrudeDragEnd
	}, {
		raycasterFromEvent,
		selectOtherRef: void 0,
		navToolActiveRef,
		isApplyingRef
	}, holdRefs), [
		elements,
		getObject,
		raycasterFromEvent,
		raycastToObjects,
		navToolActiveRef,
		arrowHandlesRef,
		hoveredElementRef,
		beginArrowDrag,
		handleProfilePick,
		handleEmptyPick,
		onExtrudeDrag,
		onExtrudeDragEnd,
		tintElement,
		cleanupHandles,
		cleanupHoverOverlay,
		cleanupPreview,
		restoreOriginalMesh,
		originalBrepRef,
		cachedPreviewGeometryRef,
		previewBuildVersionRef,
		setState,
		holdRefs
	]);
	return {
		handleMouseDown: handlers.handleMouseDown,
		handleMouseMove: handlers.handleMouseMove,
		handleMouseUp: handlers.handleMouseUp,
		handleKeyDown: handlers.handleKeyDown
	};
}
//#endregion
//#region src/hooks/shared/tintMeshes.ts
/** Set the body color on every mesh inside the object identified by `nodeId`.
*  Skips edge-overlay LineSegments and helper nodes. No-op if the object is
*  not in the scene yet (getObject returns null/undefined). */
function tintMeshes(getObject, nodeId, color) {
	const obj = getObject(nodeId);
	if (!obj) return;
	obj.traverse((child) => {
		if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) child.material.color.set(color);
	});
}
/** Variant that also tints child `THREE.Line` objects flagged with
*  `userData.isPathLine`. Used by sweep where the path is a polyline. */
function tintMeshesAndPathLines(getObject, nodeId, color) {
	const obj = getObject(nodeId);
	if (!obj) return;
	obj.traverse((child) => {
		if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) child.material.color.set(color);
		if (child instanceof THREE.Line && child.userData.isPathLine) child.material.color.set(color);
	});
}
//#endregion
//#region src/hooks/extrude/hooks/useExtrudeState.ts
function useExtrudeState() {
	const { elements, getObject } = useCadCore();
	const { scene, forceSceneUpdate } = useCadVisualizer();
	const [state, setState] = useState({
		selectedElements: [],
		isExtruding: false,
		activeDirection: null,
		extrusionDepth: 0,
		showDimensionInput: false,
		dimensionInputPosition: {
			x: 0,
			y: 0
		},
		operationType: "join"
	});
	const startPointRef = useRef(null);
	const startScreenRef = useRef(null);
	const originalBrepRef = useRef(/* @__PURE__ */ new Map());
	const arrowHandlesRef = useRef([]);
	const originalMeshRef = useRef(/* @__PURE__ */ new Map());
	const hoveredElementRef = useRef(null);
	const hoverOverlayRef = useRef(null);
	const dimmedMaterialsRef = useRef(/* @__PURE__ */ new Map());
	const previewBuildVersionRef = useRef(0);
	const selectedElementsRef = useRef(state.selectedElements);
	selectedElementsRef.current = state.selectedElements;
	const dimSceneBodies = useCallback(() => {
		elements.forEach((el) => {
			if (isFlat(el.brep) || el.sketchPlane) return;
			const obj = getObject(el.nodeId);
			if (!obj) return;
			obj.traverse((child) => {
				if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) {
					const mat = child.material;
					if (dimmedMaterialsRef.current.has(mat.uuid)) return;
					const savedColor = mat.color.getHex();
					const savedOpacity = mat.opacity;
					const savedTransparent = mat.transparent;
					dimmedMaterialsRef.current.set(mat.uuid, () => {
						mat.color.set(savedColor);
						mat.opacity = savedOpacity;
						mat.transparent = savedTransparent;
						mat.polygonOffset = false;
						mat.polygonOffsetFactor = 0;
						mat.polygonOffsetUnits = 0;
						mat.needsUpdate = true;
					});
					mat.transparent = true;
					mat.opacity = BODY.dimmedOpacity;
					mat.color.set(BODY.dimmedColor);
					mat.polygonOffset = true;
					mat.polygonOffsetFactor = 1;
					mat.polygonOffsetUnits = 1;
					mat.needsUpdate = true;
				}
				if (child.userData.isEdgeOverlay) {
					const mat = child.material;
					if (!mat || dimmedMaterialsRef.current.has(mat.uuid)) return;
					const savedColor = mat.color?.getHex() ?? 16777215;
					const savedOpacity = mat.opacity ?? 1;
					const savedTransparent = mat.transparent ?? false;
					dimmedMaterialsRef.current.set(mat.uuid, () => {
						mat.color?.set(savedColor);
						mat.opacity = savedOpacity;
						mat.transparent = savedTransparent;
						mat.polygonOffset = false;
						mat.polygonOffsetFactor = 0;
						mat.polygonOffsetUnits = 0;
						mat.needsUpdate = true;
					});
					mat.transparent = true;
					mat.opacity = BODY.dimmedOpacity;
					mat.polygonOffset = true;
					mat.polygonOffsetFactor = 1;
					mat.polygonOffsetUnits = 1;
					mat.needsUpdate = true;
				}
			});
		});
	}, [elements, getObject]);
	const restoreSceneBodies = useCallback(() => {
		dimmedMaterialsRef.current.forEach((restore) => restore());
		dimmedMaterialsRef.current.clear();
	}, []);
	const tintElement = useCallback((nodeId, color) => tintMeshes(getObject, nodeId, color), [getObject]);
	const cleanupHandles = useCallback(() => {
		if (scene) {
			arrowHandlesRef.current.forEach((handle) => {
				scene.remove(handle);
				handle.traverse((child) => {
					if (child instanceof THREE.Mesh) {
						child.geometry.dispose();
						if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
						else child.material.dispose();
					}
				});
			});
			arrowHandlesRef.current = [];
		}
	}, [scene]);
	const createArrowHandles = useCallback((nodeIds, opType) => {
		if (!scene) return;
		cleanupHandles();
		if (nodeIds.length === 0) return;
		const selectedEls = nodeIds.map((id) => elements.find((el) => el.nodeId === id)).filter((el) => !!el);
		if (selectedEls.length === 0) return;
		const bbox = new THREE.Box3();
		for (const el of selectedEls) {
			const obj = getObject(el.nodeId);
			if (obj) bbox.expandByObject(obj);
		}
		if (bbox.isEmpty()) return;
		const center = new THREE.Vector3();
		bbox.getCenter(center);
		const arrowLength = 1.5;
		const shaftRadius = .04;
		const headRadius = .12;
		const headLength = .3;
		const firstEl = selectedEls[0];
		const normal = getFlatNormal(firstEl.brep, firstEl);
		const isCut = (opType ?? state.operationType) === "cut";
		const primaryColor = isCut ? EXTRUDE.cutArrow : EXTRUDE.arrow;
		const secondaryColor = isCut ? EXTRUDE.cutArrowSecondary : EXTRUDE.arrowSecondary;
		const upOpacity = isCut ? .5 : 1;
		const downOpacity = isCut ? 1 : .5;
		const upArrow = buildArrowGeometry(center, normal.clone(), arrowLength, shaftRadius, headRadius, headLength, primaryColor, upOpacity, "up");
		scene.add(upArrow);
		arrowHandlesRef.current.push(upArrow);
		const downArrow = buildArrowGeometry(center, normal.clone().negate(), arrowLength, shaftRadius, headRadius, headLength, secondaryColor, downOpacity, "down");
		scene.add(downArrow);
		arrowHandlesRef.current.push(downArrow);
		forceSceneUpdate();
	}, [
		elements,
		getObject,
		scene,
		forceSceneUpdate,
		cleanupHandles,
		state.operationType
	]);
	return {
		state,
		setState,
		startPointRef,
		startScreenRef,
		originalBrepRef,
		arrowHandlesRef,
		originalMeshRef,
		hoveredElementRef,
		hoverOverlayRef,
		dimmedMaterialsRef,
		previewBuildVersionRef,
		dimSceneBodies,
		restoreSceneBodies,
		tintElement,
		cleanupHandles,
		createArrowHandles,
		toggleOperationType: useCallback(() => {
			const newType = state.operationType === "join" ? "cut" : "join";
			setState((prev) => ({
				...prev,
				operationType: newType
			}));
			if (state.selectedElements.length > 0) createArrowHandles(state.selectedElements, newType);
		}, [
			state.operationType,
			state.selectedElements,
			createArrowHandles
		]),
		cleanupHoverOverlay: useCallback(() => {
			if (scene && hoverOverlayRef.current) {
				scene.remove(hoverOverlayRef.current);
				hoverOverlayRef.current.geometry.dispose();
				hoverOverlayRef.current.material.dispose();
				hoverOverlayRef.current = null;
			}
			if (hoveredElementRef.current) {
				const id = hoveredElementRef.current;
				tintMeshes(getObject, id, selectedElementsRef.current.includes(id) ? SELECTION.selected : BODY.default);
				hoveredElementRef.current = null;
			}
		}, [scene, getObject])
	};
}
//#endregion
//#region src/hooks/extrude/hooks/usePreviewRendering.ts
function usePreviewRendering({ stateBag }) {
	const { elements, getObject } = useCadCore();
	const { scene, forceSceneUpdate } = useCadVisualizer();
	const { state, originalBrepRef, originalMeshRef } = stateBag;
	const previewMeshRef = useRef(/* @__PURE__ */ new Map());
	const cachedPreviewGeometryRef = useRef(/* @__PURE__ */ new Map());
	const cleanupPreview = useCallback(() => {
		if (!scene) return;
		previewMeshRef.current.forEach((mesh) => {
			scene.remove(mesh);
			mesh.geometry.dispose();
			if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
			else mesh.material.dispose();
		});
		previewMeshRef.current.clear();
	}, [scene]);
	return {
		previewMeshRef,
		cachedPreviewGeometryRef,
		cleanupPreview,
		restoreOriginalMesh: useCallback(() => {
			originalMeshRef.current.forEach((obj) => {
				obj.visible = true;
			});
			originalMeshRef.current.clear();
		}, [originalMeshRef]),
		buildCachedPreviewGeometry: useCallback(async (brep, element) => {
			try {
				const client = OccWorkerClient.getInstance();
				const normal = getFlatNormal(brep, element);
				return reconstructFaceGeometry((await client.send({
					type: "previewGeometry",
					payload: {
						brepJson: brep.toJSON(),
						sourceOccBrep: element?.occBrep,
						normalVec: toVec3(normal)
					}
				})).faceGeometry);
			} catch (error) {
				console.warn("[useExtrudeMode] Failed to build OCC preview geometry:", error);
				return null;
			}
		}, []),
		updatePreview: useCallback((depth, direction) => {
			if (state.selectedElements.length === 0) return;
			for (const nodeId of state.selectedElements) {
				if (originalMeshRef.current.has(nodeId)) continue;
				const obj = getObject(nodeId);
				if (!obj) continue;
				originalMeshRef.current.set(nodeId, obj);
				obj.visible = false;
			}
			cleanupPreview();
			const extrusionDepth = Math.abs(depth);
			const directionSign = direction === "down" ? -1 : 1;
			const previewColor = state.operationType === "cut" ? EXTRUDE.cutPreview : EXTRUDE.profileHighlight;
			if (!scene) return;
			for (const nodeId of state.selectedElements) {
				const element = elements.find((el) => el.nodeId === nodeId);
				const origBrep = originalBrepRef.current.get(nodeId);
				const cachedGeom = cachedPreviewGeometryRef.current.get(nodeId);
				if (!element || !origBrep || !cachedGeom) continue;
				const previewMesh = new THREE.Mesh(cachedGeom.clone(), new THREE.MeshStandardMaterial({
					color: previewColor,
					transparent: true,
					opacity: .6,
					side: THREE.DoubleSide,
					depthTest: false
				}));
				previewMesh.renderOrder = 500;
				const normal = getFlatNormal(origBrep, element);
				let s;
				let offsetX, offsetY, offsetZ;
				if (direction === "symmetric") {
					s = extrusionDepth * 2;
					offsetX = element.position.x - extrusionDepth * normal.x;
					offsetY = element.position.y - extrusionDepth * normal.y;
					offsetZ = element.position.z - extrusionDepth * normal.z;
				} else {
					s = extrusionDepth * directionSign;
					offsetX = element.position.x;
					offsetY = element.position.y;
					offsetZ = element.position.z;
				}
				previewMesh.matrixAutoUpdate = false;
				const m = buildDirectionalScaleMatrix(normal, s, {
					x: offsetX,
					y: offsetY,
					z: offsetZ
				});
				previewMesh.matrix.copy(m);
				previewMesh.userData.isPreview = true;
				scene.add(previewMesh);
				previewMeshRef.current.set(nodeId, previewMesh);
			}
			forceSceneUpdate();
		}, [
			state.selectedElements,
			state.operationType,
			elements,
			getObject,
			scene,
			forceSceneUpdate,
			cleanupPreview,
			originalBrepRef,
			originalMeshRef
		])
	};
}
//#endregion
//#region src/hooks/shared/useModeCleanup.ts
/**
* Standardised cleanup wiring for mode hooks.
*
* Pin the latest cleanup body in a ref so the mode-leave effect always calls
* an up-to-date version, and expose a stable `cleanup` callback that internal
* callers (e.g. an Escape handler) can invoke with the same identity across
* renders. Returns the cleanup callback alongside the underlying ref so
* advanced callers can override it if needed.
*
* Replaces ~16 LOC of identical boilerplate across `useExtrudeMode`,
* `useSweepMode`, `useLoftMode`.
*/
function useModeCleanup(activeMode, modeName, cleanupFn) {
	const cleanupRef = useRef(cleanupFn);
	cleanupRef.current = cleanupFn;
	const cleanup = useCallback(() => cleanupRef.current(), []);
	useEffect(() => {
		if (activeMode !== modeName) return;
		return () => cleanupRef.current();
	}, [activeMode, modeName]);
	return {
		cleanup,
		cleanupRef
	};
}
//#endregion
//#region src/hooks/useExtrudeMode.ts
/**
* Hook for Fusion 360-style extrude mode.
* Allows selecting flat shapes and extruding them with arrow handles.
*
* Composed of five sub-hooks living under `hooks/extrude/`:
*   - useExtrudeState         (state + selection refs + dimming + arrow handles)
*   - usePreviewRendering     (OCC preview cache + live mesh updates)
*   - useExtrudeApply         (commit: applyExtrusion / applyCutExtrusion)
*   - useExtrudeDimension     (dimension input UI handlers)
*   - useExtrudeInputHandlers (mouse + keyboard handlers)
*/
function useExtrudeMode() {
	const { mode } = useCadCore();
	const stateBag = useExtrudeState();
	const preview = usePreviewRendering({ stateBag });
	const dimension = useExtrudeDimension({
		stateBag,
		preview,
		apply: useExtrudeApply({
			stateBag,
			preview
		})
	});
	const handlers = useExtrudeInputHandlers({
		stateBag,
		preview
	});
	const { state, setState, startPointRef, startScreenRef, originalBrepRef, tintElement, cleanupHandles, restoreSceneBodies, cleanupHoverOverlay, toggleOperationType, dimSceneBodies } = stateBag;
	const { cleanupPreview, restoreOriginalMesh, cachedPreviewGeometryRef } = preview;
	const { cleanup } = useModeCleanup(mode, "extrude", () => {
		setState((prev) => {
			prev.selectedElements.forEach((id) => tintElement(id, BODY.default));
			return prev;
		});
		cleanupHandles();
		cleanupPreview();
		cleanupHoverOverlay();
		restoreOriginalMesh();
		restoreSceneBodies();
		originalBrepRef.current.clear();
		cachedPreviewGeometryRef.current.clear();
		setState((prev) => ({
			selectedElements: [],
			isExtruding: false,
			activeDirection: null,
			extrusionDepth: 0,
			showDimensionInput: false,
			dimensionInputPosition: {
				x: 0,
				y: 0
			},
			operationType: prev.operationType
		}));
		startPointRef.current = null;
		startScreenRef.current = null;
	});
	return {
		selectedElements: state.selectedElements,
		isExtruding: state.isExtruding,
		extrusionDepth: state.extrusionDepth,
		activeDirection: state.activeDirection,
		showDimensionInput: state.showDimensionInput,
		dimensionInputPosition: state.dimensionInputPosition,
		operationType: state.operationType,
		handleMouseDown: handlers.handleMouseDown,
		handleMouseMove: handlers.handleMouseMove,
		handleMouseUp: handlers.handleMouseUp,
		handleKeyDown: handlers.handleKeyDown,
		handleDimensionSubmit: dimension.handleDimensionSubmit,
		handleDimensionCancel: dimension.handleDimensionCancel,
		handleDimensionChange: dimension.handleDimensionChange,
		toggleOperationType,
		cleanup,
		dimSceneBodies
	};
}
//#endregion
//#region src/hooks/fillet/hooks/useFilletApply.ts
function useFilletApply({ stateBag, edgeOverlay }) {
	const { elements, updateElementBrep } = useCadCore();
	const { forceSceneUpdate } = useCadVisualizer();
	const { state, setState, resetBodyHover, resetSelectedBody } = stateBag;
	const { cleanupEdgeOverlay } = edgeOverlay;
	return { applyOperation: useCallback(async (radius) => {
		if (!state.selectedElement || state.selectedEdgeIndices.length === 0 || radius <= 0) return;
		const element = elements.find((el) => el.nodeId === state.selectedElement);
		if (!element) return;
		setState((prev) => ({
			...prev,
			isApplying: true
		}));
		try {
			const result = await (state.operationType === "fillet" ? filletBRep : chamferBRep)(element.brep, element.position, state.selectedEdgeIndices, radius, element.occBrep, element.rotation);
			if (!result.ok) {
				notify(`${state.operationType === "fillet" ? "Fillet" : "Chamfer"} failed: ${result.reason}`, "error");
				setState((prev) => ({
					...prev,
					isApplying: false
				}));
				return;
			}
			const value = result.value;
			const newPosition = new THREE.Vector3(element.position.x + value.positionOffset.x, element.position.y + value.positionOffset.y, element.position.z + value.positionOffset.z);
			updateElementBrep(state.selectedElement, value.brep, newPosition, { type: state.operationType }, value.edgeGeometry, value.occBrep, value.faceGeometry, value.vertexPositions);
			cleanupEdgeOverlay();
			resetBodyHover();
			resetSelectedBody();
			setState({
				selectedElement: null,
				selectedEdgeIndices: [],
				hoveredEdgeIndex: null,
				radius: .3,
				operationType: state.operationType,
				isApplying: false,
				showDimensionInput: false,
				dimensionInputPosition: {
					x: 0,
					y: 0
				}
			});
			forceSceneUpdate();
		} catch (error) {
			console.error(`[useFilletMode] ${state.operationType} failed:`, error);
			notify(`${state.operationType === "fillet" ? "Fillet" : "Chamfer"} failed`, "error");
			setState((prev) => ({
				...prev,
				isApplying: false
			}));
		}
	}, [
		state.selectedElement,
		state.selectedEdgeIndices,
		state.operationType,
		elements,
		updateElementBrep,
		cleanupEdgeOverlay,
		resetBodyHover,
		resetSelectedBody,
		forceSceneUpdate,
		setState
	]) };
}
//#endregion
//#region src/hooks/fillet/hooks/useFilletDimensionInput.ts
function useFilletDimensionInput({ stateBag, apply }) {
	const { camera, renderer } = useCadVisualizer();
	const { setState, edgeSegmentsRef } = stateBag;
	const { applyOperation } = apply;
	return {
		showDimensionInputAtEdge: useCallback((edgeIndices) => {
			if (!camera || !renderer || edgeIndices.length === 0) return;
			const firstIdx = edgeIndices[0];
			const edgeData = edgeSegmentsRef.current.find((e) => e.edgeIndex === firstIdx);
			if (!edgeData) return;
			const worldPos = new THREE.Vector3(edgeData.midpoint.x, edgeData.midpoint.y, edgeData.midpoint.z);
			worldPos.project(camera);
			const rect = renderer.domElement.getBoundingClientRect();
			const screenX = (worldPos.x + 1) / 2 * rect.width + rect.left;
			const screenY = (-worldPos.y + 1) / 2 * rect.height + rect.top;
			setState((prev) => ({
				...prev,
				showDimensionInput: true,
				dimensionInputPosition: {
					x: screenX,
					y: screenY - 50
				}
			}));
		}, [
			camera,
			renderer,
			edgeSegmentsRef,
			setState
		]),
		handleRadiusSubmit: useCallback(async (value) => {
			if (value > 0) {
				setState((prev) => ({
					...prev,
					radius: value,
					showDimensionInput: false
				}));
				await applyOperation(value);
			}
		}, [applyOperation, setState]),
		handleRadiusCancel: useCallback(() => {
			setState((prev) => ({
				...prev,
				showDimensionInput: false
			}));
		}, [setState])
	};
}
//#endregion
//#region src/hooks/fillet/hooks/useFilletEdgeOverlay.ts
function useFilletEdgeOverlay({ stateBag }) {
	const { elements } = useCadCore();
	const { scene, forceSceneUpdate } = useCadVisualizer();
	const { state, setState, edgeSegmentsRef, edgeOverlayGroupRef, originalBrepRef, tintSelectedBody, resetSelectedBody } = stateBag;
	/** Clean up edge overlay lines from scene. */
	const cleanupEdgeOverlay = useCallback(() => {
		if (scene && edgeOverlayGroupRef.current) {
			scene.remove(edgeOverlayGroupRef.current);
			edgeOverlayGroupRef.current.traverse((child) => {
				if (child instanceof Line2) {
					child.geometry.dispose();
					child.material.dispose();
				}
			});
			edgeOverlayGroupRef.current = null;
		}
		edgeSegmentsRef.current = [];
	}, [
		scene,
		edgeOverlayGroupRef,
		edgeSegmentsRef
	]);
	/**
	* Build edge overlays for the selected element.
	* Per-edge LineSegments allow individual raycast and highlight.
	*/
	const buildEdgeOverlays = useCallback(async (nodeId) => {
		if (!scene) return;
		cleanupEdgeOverlay();
		const element = elements.find((el) => el.nodeId === nodeId);
		if (!element) return;
		try {
			const edgeData = (await OccWorkerClient.getInstance().send({
				type: "edgeAnalysis",
				payload: {
					brepJson: element.brep.toJSON(),
					position: toVec3(element.position),
					occBrep: element.occBrep,
					rotation: element.rotation ? toEulerJSON(element.rotation) : void 0,
					allEdges: false
				}
			})).edges;
			edgeSegmentsRef.current = edgeData;
			const group = new THREE.Group();
			group.userData.isFilletEdgeOverlay = true;
			for (const edge of edgeData) {
				const pairs = edge.segments;
				const strip = [];
				for (let i = 0; i < pairs.length; i += 6) {
					if (strip.length === 0) strip.push(pairs[i], pairs[i + 1], pairs[i + 2]);
					strip.push(pairs[i + 3], pairs[i + 4], pairs[i + 5]);
				}
				const geometry = new LineGeometry();
				geometry.setPositions(strip);
				const line = new Line2(geometry, new LineMaterial({
					color: FILLET.edgeHover,
					linewidth: FILLET.edgeWidth,
					transparent: true,
					opacity: 0,
					depthTest: false,
					resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
				}));
				line.computeLineDistances();
				line.userData.edgeIndex = edge.edgeIndex;
				line.userData.isFilletEdge = true;
				line.renderOrder = 999;
				group.add(line);
			}
			scene.add(group);
			edgeOverlayGroupRef.current = group;
			forceSceneUpdate();
		} catch (error) {
			console.error("[useFilletMode] Failed to build edge overlays:", error);
		}
	}, [
		elements,
		scene,
		forceSceneUpdate,
		cleanupEdgeOverlay,
		edgeOverlayGroupRef,
		edgeSegmentsRef
	]);
	return {
		cleanupEdgeOverlay,
		buildEdgeOverlays,
		updateEdgeColors: useCallback((selectedIndices, hoveredIndex) => {
			if (!edgeOverlayGroupRef.current) return;
			edgeOverlayGroupRef.current.children.forEach((child) => {
				if (child instanceof Line2 && child.userData.isFilletEdge) {
					const idx = child.userData.edgeIndex;
					const mat = child.material;
					if (selectedIndices.includes(idx)) {
						mat.color.set(FILLET.edgeHighlight);
						mat.opacity = 1;
					} else if (idx === hoveredIndex) {
						mat.color.set(FILLET.edgeHover);
						mat.opacity = 1;
					} else mat.opacity = 0;
				}
			});
		}, [edgeOverlayGroupRef]),
		selectBodyById: useCallback((elementId) => {
			if (elementId === state.selectedElement) return;
			const el = elements.find((e) => e.nodeId === elementId);
			if (!el) return;
			cleanupEdgeOverlay();
			resetSelectedBody();
			tintSelectedBody(elementId);
			originalBrepRef.current = el.brep;
			setState((prev) => ({
				...prev,
				selectedElement: elementId,
				selectedEdgeIndices: [],
				hoveredEdgeIndex: null,
				showDimensionInput: false
			}));
			buildEdgeOverlays(elementId);
		}, [
			elements,
			state.selectedElement,
			cleanupEdgeOverlay,
			buildEdgeOverlays,
			originalBrepRef,
			setState,
			tintSelectedBody,
			resetSelectedBody
		])
	};
}
//#endregion
//#region src/hooks/fillet/hooks/useFilletInputHandlers.ts
function useFilletInputHandlers({ stateBag, edgeOverlay, apply, dimension }) {
	const { elements, getObject } = useCadCore();
	const { forceSceneUpdate, navToolActiveRef, selectOtherRef } = useCadVisualizer();
	const { raycasterFromEvent } = useRaycastToObjects();
	const { state, setState, edgeOverlayGroupRef, hoveredBodyRef, hoverPreviewRef, menuOpenRef, resetBodyHover, resetSelectedBody, applyHoverPreview, toggleOperationType } = stateBag;
	const { cleanupEdgeOverlay, updateEdgeColors, selectBodyById } = edgeOverlay;
	const { applyOperation } = apply;
	const { showDimensionInputAtEdge } = dimension;
	const isApplyingRef = useMemo(() => ({ current: state.isApplying }), [state.isApplying]);
	const holdRefs = useModeInputHoldRefs();
	return useMemo(() => {
		return createModeInputHandlers({
			pickTargets: (raycaster, event) => {
				if (state.selectedElement && edgeOverlayGroupRef.current) {
					const edgeObjects = [];
					edgeOverlayGroupRef.current.traverse((child) => {
						if (child instanceof Line2) edgeObjects.push(child);
					});
					const edgeIntersects = raycaster.intersectObjects(edgeObjects);
					if (edgeIntersects.length > 0) {
						const hit0 = edgeIntersects[0];
						const edgeIndex = hit0.object.userData.edgeIndex;
						return {
							picks: [{
								key: `edge-${edgeIndex}`,
								label: `Edge ${edgeIndex}`,
								distance: hit0.distance,
								elementId: `edge-${edgeIndex}`,
								object: hit0.object
							}],
							resolved: {
								kind: "edge",
								edgeIndex,
								ctrlKey: event.ctrlKey || event.metaKey
							}
						};
					}
					const obj = getObject(state.selectedElement);
					if (obj) {
						if (raycaster.intersectObjects([obj], true).length > 0) return {
							picks: [{
								key: "fillet-body-noedge",
								label: "",
								distance: 0,
								elementId: "",
								object: obj
							}],
							resolved: { kind: "deselect-edges" }
						};
					}
					return {
						picks: [{
							key: "fillet-empty",
							label: "",
							distance: 0,
							elementId: "",
							object: new THREE.Object3D()
						}],
						resolved: { kind: "deselect-all" }
					};
				}
				const picks = collectPicksUnderCursor(raycaster, elements, getObject, {
					filter: isElement3D,
					nameFor: makeBodyOrProfileLabel(elements)
				});
				if (picks.length === 0) return null;
				return {
					picks,
					resolved: {
						kind: "body",
						elementId: picks[0].elementId
					}
				};
			},
			hoverTargets: (raycaster) => {
				if (state.selectedElement && edgeOverlayGroupRef.current) {
					const edgeObjects = [];
					edgeOverlayGroupRef.current.traverse((child) => {
						if (child instanceof Line2) edgeObjects.push(child);
					});
					const edgeIntersects = raycaster.intersectObjects(edgeObjects);
					if (edgeIntersects.length > 0) return {
						kind: "edge",
						edgeIndex: edgeIntersects[0].object.userData.edgeIndex,
						ctrlKey: false
					};
					return null;
				}
				const objects = [];
				elements.forEach((el) => {
					if (isElement3D(el)) {
						const obj = getObject(el.nodeId);
						if (obj) objects.push(obj);
					}
				});
				const intersects = raycaster.intersectObjects(objects, true);
				if (intersects.length === 0) return null;
				const pickedObject = intersects[0].object;
				for (const el of elements) {
					if (!isElement3D(el)) continue;
					const obj = getObject(el.nodeId);
					if (obj && isDescendantOf(pickedObject, obj)) return {
						kind: "body",
						elementId: el.nodeId
					};
				}
				return null;
			},
			onPickStart: (resolved) => {
				if (resolved.kind === "edge") {
					const { edgeIndex, ctrlKey } = resolved;
					const newSelected = ctrlKey ? state.selectedEdgeIndices.includes(edgeIndex) ? state.selectedEdgeIndices.filter((i) => i !== edgeIndex) : [...state.selectedEdgeIndices, edgeIndex] : [edgeIndex];
					setState((prev) => ({
						...prev,
						selectedEdgeIndices: newSelected,
						showDimensionInput: newSelected.length > 0
					}));
					updateEdgeColors(newSelected, null);
					if (newSelected.length > 0) showDimensionInputAtEdge(newSelected);
					forceSceneUpdate();
					return;
				}
				if (resolved.kind === "body") {
					resetBodyHover();
					selectBodyById(resolved.elementId);
					return;
				}
				if (resolved.kind === "deselect-edges") {
					setState((prev) => ({
						...prev,
						selectedEdgeIndices: [],
						showDimensionInput: false
					}));
					return;
				}
				cleanupEdgeOverlay();
				resetSelectedBody();
				setState((prev) => ({
					...prev,
					selectedElement: null,
					selectedEdgeIndices: [],
					hoveredEdgeIndex: null,
					showDimensionInput: false
				}));
			},
			onPickFromMenu: (item, resolved) => {
				if (resolved.kind !== "body") return;
				menuOpenRef.current = false;
				hoverPreviewRef.current = null;
				selectBodyById(item.elementId);
			},
			onHover: (hoverPick) => {
				if (state.selectedElement) {
					const newHovered = hoverPick?.kind === "edge" ? hoverPick.edgeIndex : null;
					if (newHovered !== state.hoveredEdgeIndex) {
						setState((prev) => ({
							...prev,
							hoveredEdgeIndex: newHovered
						}));
						updateEdgeColors(state.selectedEdgeIndices, newHovered);
						forceSceneUpdate();
					}
					return null;
				}
				const foundId = hoverPick?.kind === "body" ? hoverPick.elementId : null;
				if (foundId && foundId !== hoveredBodyRef.current) {
					resetBodyHover();
					hoveredBodyRef.current = foundId;
					const obj = getObject(foundId);
					if (obj) obj.traverse((child) => {
						if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) child.material.color.set(SELECTION.hover);
					});
					forceSceneUpdate();
				} else if (!foundId && hoveredBodyRef.current) {
					resetBodyHover();
					forceSceneUpdate();
				}
				return null;
			},
			onMenuOpen: (resolved) => {
				if (resolved.kind === "body") menuOpenRef.current = true;
			},
			onMenuCancel: (resolved) => {
				if (resolved.kind === "body") {
					menuOpenRef.current = false;
					hoverPreviewRef.current = null;
				}
			},
			onCancel: () => {
				if (state.isApplying) return;
				if (state.selectedEdgeIndices.length > 0) {
					setState((prev) => ({
						...prev,
						selectedEdgeIndices: [],
						hoveredEdgeIndex: null,
						showDimensionInput: false
					}));
					updateEdgeColors([], null);
					forceSceneUpdate();
				} else if (state.selectedElement) {
					cleanupEdgeOverlay();
					resetSelectedBody();
					setState((prev) => ({
						...prev,
						selectedElement: null,
						selectedEdgeIndices: [],
						hoveredEdgeIndex: null,
						showDimensionInput: false
					}));
				}
			},
			onCommit: () => {
				if (state.isApplying) return;
				if (state.selectedEdgeIndices.length > 0 && state.radius > 0) applyOperation(state.radius);
			},
			enableContextMenu: !state.selectedElement,
			extraKeys: {
				f: (event) => {
					if (event.target?.tagName === "INPUT") return;
					toggleOperationType();
				},
				F: (event) => {
					if (event.target?.tagName === "INPUT") return;
					toggleOperationType();
				}
			}
		}, {
			raycasterFromEvent,
			selectOtherRef,
			navToolActiveRef,
			isApplyingRef
		}, holdRefs);
	}, [
		elements,
		getObject,
		raycasterFromEvent,
		selectOtherRef,
		navToolActiveRef,
		isApplyingRef,
		holdRefs,
		state.selectedElement,
		state.selectedEdgeIndices,
		state.hoveredEdgeIndex,
		state.isApplying,
		state.radius,
		edgeOverlayGroupRef,
		hoveredBodyRef,
		hoverPreviewRef,
		menuOpenRef,
		cleanupEdgeOverlay,
		updateEdgeColors,
		showDimensionInputAtEdge,
		forceSceneUpdate,
		resetBodyHover,
		resetSelectedBody,
		selectBodyById,
		applyHoverPreview,
		toggleOperationType,
		applyOperation,
		setState
	]);
}
//#endregion
//#region src/hooks/shared/useHoverPreview.ts
/**
* Select Other hover preview: depth-test off + hover tint + render-on-top so the
* previewed body shows through occluders. Restoring returns to defaults.
*
* Used by fillet/sweep/loft/revolve mode-state hooks.
*/
function useHoverPreview() {
	const { getObject } = useCadCore();
	const hoverPreviewRef = useRef(null);
	const restoreHoverPreview = useCallback((nodeId) => {
		const obj = getObject(nodeId);
		if (!obj) return;
		obj.traverse((child) => {
			if (child.userData.isEdgeOverlay || child.userData.isHelper) return;
			if (child.isMesh) {
				const mat = child.material;
				if (mat && !Array.isArray(mat)) {
					mat.color.set(BODY.default);
					mat.depthTest = true;
				}
				child.renderOrder = 0;
			}
		});
	}, [getObject]);
	return {
		hoverPreviewRef,
		applyHoverPreview: useCallback((item) => {
			const prev = hoverPreviewRef.current;
			if (prev && (!item || item.elementId !== prev)) {
				restoreHoverPreview(prev);
				hoverPreviewRef.current = null;
			}
			if (!item) return;
			const obj = getObject(item.elementId);
			if (!obj) return;
			obj.traverse((child) => {
				if (child.userData.isEdgeOverlay || child.userData.isHelper) return;
				if (child.isMesh) {
					const mat = child.material;
					if (mat && !Array.isArray(mat)) {
						mat.color.set(SELECTION.hover);
						mat.depthTest = false;
					}
					child.renderOrder = 999;
				}
			});
			hoverPreviewRef.current = item.elementId;
		}, [getObject, restoreHoverPreview]),
		restoreHoverPreview
	};
}
//#endregion
//#region src/hooks/fillet/hooks/useFilletState.ts
function useFilletState() {
	const { getObject } = useCadCore();
	const [state, setState] = useState({
		selectedElement: null,
		selectedEdgeIndices: [],
		hoveredEdgeIndex: null,
		radius: .3,
		operationType: "fillet",
		isApplying: false,
		showDimensionInput: false,
		dimensionInputPosition: {
			x: 0,
			y: 0
		}
	});
	const edgeSegmentsRef = useRef([]);
	const edgeOverlayGroupRef = useRef(null);
	const originalBrepRef = useRef(null);
	const hoveredBodyRef = useRef(null);
	const selectedBodyTintedRef = useRef(null);
	const holdStartRef = useRef(null);
	const menuOpenRef = useRef(false);
	const { hoverPreviewRef, applyHoverPreview, restoreHoverPreview } = useHoverPreview();
	return {
		state,
		setState,
		edgeSegmentsRef,
		edgeOverlayGroupRef,
		originalBrepRef,
		hoveredBodyRef,
		selectedBodyTintedRef,
		holdStartRef,
		hoverPreviewRef,
		menuOpenRef,
		resetBodyHover: useCallback(() => {
			if (hoveredBodyRef.current) {
				const obj = getObject(hoveredBodyRef.current);
				if (obj) obj.traverse((child) => {
					if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) child.material.color.set(BODY.default);
				});
				hoveredBodyRef.current = null;
			}
		}, [getObject]),
		tintSelectedBody: useCallback((nodeId) => {
			const obj = getObject(nodeId);
			if (obj) obj.traverse((child) => {
				if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) child.material.color.set(SELECTION.selected);
			});
			selectedBodyTintedRef.current = nodeId;
		}, [getObject]),
		resetSelectedBody: useCallback(() => {
			if (selectedBodyTintedRef.current) {
				const obj = getObject(selectedBodyTintedRef.current);
				if (obj) obj.traverse((child) => {
					if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) child.material.color.set(BODY.default);
				});
				selectedBodyTintedRef.current = null;
			}
		}, [getObject]),
		applyHoverPreview,
		restoreHoverPreview,
		toggleOperationType: useCallback(() => {
			setState((prev) => ({
				...prev,
				operationType: prev.operationType === "fillet" ? "chamfer" : "fillet"
			}));
		}, [])
	};
}
//#endregion
//#region src/hooks/useFilletMode.ts
/**
* Hook for fillet/chamfer mode.
* Toggle between fillet and chamfer via F key (`operationType` field).
*
* Composed of five sub-hooks living under `hooks/fillet/`:
*   - useFilletState          (state + refs + body hover + select-other preview + toggle)
*   - useFilletEdgeOverlay    (build/update/cleanup edge overlays + selectBodyById)
*   - useFilletApply          (applyOperation, fillet or chamfer branch)
*   - useFilletDimensionInput (radius input UI: show/submit/cancel)
*   - useFilletInputHandlers  (mouse + keyboard + context menu + window-resize effect)
*/
function useFilletMode() {
	const stateBag = useFilletState();
	const edgeOverlay = useFilletEdgeOverlay({ stateBag });
	const apply = useFilletApply({
		stateBag,
		edgeOverlay
	});
	const dimension = useFilletDimensionInput({
		stateBag,
		apply
	});
	const handlers = useFilletInputHandlers({
		stateBag,
		edgeOverlay,
		apply,
		dimension
	});
	const { state, setState, originalBrepRef, resetBodyHover, resetSelectedBody, toggleOperationType } = stateBag;
	const { cleanupEdgeOverlay } = edgeOverlay;
	const cleanup = useCallback(() => {
		cleanupEdgeOverlay();
		resetBodyHover();
		resetSelectedBody();
		originalBrepRef.current = null;
		setState({
			selectedElement: null,
			selectedEdgeIndices: [],
			hoveredEdgeIndex: null,
			radius: .3,
			operationType: "fillet",
			isApplying: false,
			showDimensionInput: false,
			dimensionInputPosition: {
				x: 0,
				y: 0
			}
		});
	}, [
		cleanupEdgeOverlay,
		resetBodyHover,
		resetSelectedBody,
		originalBrepRef,
		setState
	]);
	const cleanupRef = useRef(cleanup);
	cleanupRef.current = cleanup;
	useEffect(() => () => cleanupRef.current(), []);
	return {
		selectedElement: state.selectedElement,
		selectedEdgeIndices: state.selectedEdgeIndices,
		radius: state.radius,
		operationType: state.operationType,
		isApplying: state.isApplying,
		showDimensionInput: state.showDimensionInput,
		dimensionInputPosition: state.dimensionInputPosition,
		handleMouseDown: handlers.handleMouseDown,
		handleMouseMove: handlers.handleMouseMove,
		handleMouseUp: handlers.handleMouseUp,
		handleContextMenu: handlers.handleContextMenu,
		handleKeyDown: handlers.handleKeyDown,
		handleRadiusSubmit: dimension.handleRadiusSubmit,
		handleRadiusCancel: dimension.handleRadiusCancel,
		toggleOperationType,
		cleanup
	};
}
//#endregion
//#region src/hooks/loft/hooks/useLoftApply.ts
function useLoftApply({ stateBag }) {
	const { elements, loftElements } = useCadCore();
	const { forceSceneUpdate } = useCadVisualizer();
	const { state, setState } = stateBag;
	return {
		performLoft: useCallback(async () => {
			if (state.selectedProfiles.length < 2) return;
			setState((prev) => ({
				...prev,
				isApplying: true
			}));
			try {
				const profiles = state.selectedProfiles.map((nodeId) => {
					const el = elements.find((e) => e.nodeId === nodeId);
					if (!el) return null;
					const profile = {
						brep: el.brep,
						position: el.position
					};
					if (el.occBrep) profile.occBrep = el.occBrep;
					return profile;
				}).filter((p) => p !== null);
				if (profiles.length < 2) {
					console.error("[useLoftMode] Not enough valid profiles");
					notify("Not enough valid profiles for loft", "error");
					setState((prev) => ({
						...prev,
						isApplying: false
					}));
					return;
				}
				const result = await loftBReps(profiles, state.isRuled);
				if (!result.ok) notify(`Loft failed: ${result.reason}`, "error");
				else if (result.value.brep.faces.length === 0) notify("Loft produced empty result", "error");
				else {
					const value = result.value;
					loftElements(state.selectedProfiles, value.brep, value.position, value.edgeGeometry, value.occBrep, value.vertexPositions, value.faceGeometry);
					forceSceneUpdate();
				}
			} catch (error) {
				console.error("[useLoftMode] Loft failed:", error);
				notify(`Loft failed: ${error instanceof Error ? error.message : "unknown error"}`, "error");
			}
			setState((prev) => ({
				...prev,
				selectedProfiles: [],
				isApplying: false
			}));
		}, [
			state.selectedProfiles,
			state.isRuled,
			elements,
			loftElements,
			forceSceneUpdate,
			setState
		]),
		canLoft: state.selectedProfiles.length >= 2
	};
}
//#endregion
//#region src/hooks/loft/hooks/useLoftInputHandlers.ts
function useLoftInputHandlers({ stateBag, apply, cleanup }) {
	const { elements, getObject } = useCadCore();
	const { forceSceneUpdate, navToolActiveRef, selectOtherRef } = useCadVisualizer();
	const { raycasterFromEvent } = useRaycastToObjects();
	const { state, hoveredId, setHoveredId, hoverPreviewRef, menuOpenRef, heldSnapshotRef, resetHover, profileFilter, toggleProfileSelection, applyHoverPreview, restoreFromSnapshot } = stateBag;
	const { performLoft, canLoft } = apply;
	const isApplyingRef = useMemo(() => ({ current: state.isApplying }), [state.isApplying]);
	const holdRefs = useModeInputHoldRefs();
	return useMemo(() => {
		return createModeInputHandlers({
			pickTargets: (raycaster) => {
				const picks = collectPicksUnderCursor(raycaster, elements, getObject, {
					filter: profileFilter,
					nameFor: makeBodyOrProfileLabel(elements)
				});
				if (picks.length === 0) return null;
				return {
					picks,
					resolved: picks[0].elementId
				};
			},
			hoverTargets: (raycaster) => {
				const meshes = collectPickableMeshes(elements, getObject);
				const intersects = raycaster.intersectObjects(meshes, false);
				if (intersects.length === 0) return null;
				const pickedObject = intersects[0].object;
				for (const el of elements) {
					const obj = getObject(el.nodeId);
					if (obj && isDescendantOf(pickedObject, obj)) {
						if (el.elementType !== "path" && isFlat(el.brep)) return el.nodeId;
						return null;
					}
				}
				return null;
			},
			onPickStart: (firstId) => {
				heldSnapshotRef.current = [...state.selectedProfiles];
				toggleProfileSelection(firstId);
			},
			onPickFromMenu: (item) => {
				menuOpenRef.current = false;
				hoverPreviewRef.current = null;
				restoreFromSnapshot(heldSnapshotRef.current ?? []);
				toggleProfileSelection(item.elementId);
			},
			onHover: (foundId) => {
				if (foundId && foundId !== hoveredId && !state.selectedProfiles.includes(foundId)) {
					resetHover();
					setHoveredId(foundId);
					tintMeshes(getObject, foundId, SELECTION.hover);
					forceSceneUpdate();
				} else if (!foundId && hoveredId) {
					resetHover();
					forceSceneUpdate();
				}
				return null;
			},
			onMenuOpen: () => {
				menuOpenRef.current = true;
				restoreFromSnapshot(heldSnapshotRef.current ?? []);
			},
			onMenuCancel: (firstId) => {
				menuOpenRef.current = false;
				hoverPreviewRef.current = null;
				toggleProfileSelection(firstId);
			},
			onCancel: cleanup,
			onCommit: () => {
				if (canLoft) performLoft();
			},
			enableContextMenu: true
		}, {
			raycasterFromEvent,
			selectOtherRef,
			navToolActiveRef,
			isApplyingRef
		}, holdRefs);
	}, [
		elements,
		getObject,
		profileFilter,
		toggleProfileSelection,
		applyHoverPreview,
		restoreFromSnapshot,
		resetHover,
		forceSceneUpdate,
		raycasterFromEvent,
		selectOtherRef,
		navToolActiveRef,
		isApplyingRef,
		holdRefs,
		state.selectedProfiles,
		hoveredId,
		setHoveredId,
		hoverPreviewRef,
		menuOpenRef,
		heldSnapshotRef,
		cleanup,
		canLoft,
		performLoft
	]);
}
//#endregion
//#region src/hooks/loft/hooks/useLoftState.ts
function useLoftState() {
	const { elements, getObject } = useCadCore();
	const [state, setState] = useState({
		selectedProfiles: [],
		isApplying: false,
		isRuled: false
	});
	const [hoveredId, setHoveredId] = useState(null);
	const holdStartRef = useRef(null);
	const menuOpenRef = useRef(false);
	const heldSnapshotRef = useRef(null);
	const { hoverPreviewRef, applyHoverPreview, restoreHoverPreview } = useHoverPreview();
	/** Reset hover highlight, but preserve selection color for selected profiles. */
	const resetHover = useCallback(() => {
		if (hoveredId) {
			if (!state.selectedProfiles.includes(hoveredId)) tintMeshes(getObject, hoveredId, BODY.default);
			setHoveredId(null);
		}
	}, [
		getObject,
		state.selectedProfiles,
		hoveredId
	]);
	const profileFilter = useCallback((el) => el.elementType !== "path" && isFlat(el.brep), []);
	/** Set the body color of an element (mesh-only traversal). */
	const setElementColor = useCallback((nodeId, color) => tintMeshes(getObject, nodeId, color), [getObject]);
	return {
		state,
		setState,
		hoveredId,
		setHoveredId,
		holdStartRef,
		hoverPreviewRef,
		menuOpenRef,
		heldSnapshotRef,
		resetHover,
		profileFilter,
		setElementColor,
		toggleProfileSelection: useCallback((elementId) => {
			setState((prev) => {
				const isSel = prev.selectedProfiles.includes(elementId);
				setElementColor(elementId, isSel ? BODY.default : SELECTION.selected);
				return {
					...prev,
					selectedProfiles: isSel ? prev.selectedProfiles.filter((id) => id !== elementId) : [...prev.selectedProfiles, elementId]
				};
			});
		}, [setElementColor]),
		applyHoverPreview,
		restoreHoverPreview,
		restoreFromSnapshot: useCallback((snapshot) => {
			elements.forEach((el) => {
				if (el.elementType === "path") return;
				if (!isFlat(el.brep)) return;
				setElementColor(el.nodeId, snapshot.includes(el.nodeId) ? SELECTION.selected : BODY.default);
			});
			setState((prev) => ({
				...prev,
				selectedProfiles: [...snapshot]
			}));
		}, [elements, setElementColor]),
		setIsRuled: useCallback((isRuled) => {
			setState((prev) => ({
				...prev,
				isRuled
			}));
		}, [])
	};
}
//#endregion
//#region src/hooks/useLoftMode.ts
/**
* Hook for Fusion 360-style loft mode.
* Select 2+ flat profiles in order → creates smooth blended solid.
*
* Composed of three sub-hooks living under `hooks/loft/`:
*   - useLoftState         (state + refs + setters + hover + select-other preview + snapshot rollback)
*   - useLoftApply         (performLoft + canLoft)
*   - useLoftInputHandlers (mouse + keyboard + context menu)
*/
function useLoftMode() {
	const { getObject, mode } = useCadCore();
	const stateBag = useLoftState();
	const apply = useLoftApply({ stateBag });
	const { state, setState, resetHover, setIsRuled } = stateBag;
	const { cleanup } = useModeCleanup(mode, "loft", () => {
		resetHover();
		for (const nodeId of state.selectedProfiles) tintMeshes(getObject, nodeId, BODY.default);
		setState((prev) => ({
			...prev,
			selectedProfiles: [],
			isApplying: false
		}));
	});
	const handlers = useLoftInputHandlers({
		stateBag,
		apply,
		cleanup
	});
	return {
		selectedProfiles: state.selectedProfiles,
		isApplying: state.isApplying,
		isRuled: state.isRuled,
		setIsRuled,
		handleMouseDown: handlers.handleMouseDown,
		handleMouseMove: handlers.handleMouseMove,
		handleMouseUp: handlers.handleMouseUp,
		handleContextMenu: handlers.handleContextMenu,
		handleKeyDown: handlers.handleKeyDown,
		performLoft: apply.performLoft,
		canLoft: apply.canLoft,
		cleanup
	};
}
//#endregion
//#region src/hooks/measure/hooks/useEdgeOverlay.ts
function useEdgeOverlay() {
	const { elements } = useCadCore();
	const { scene, forceSceneUpdate } = useCadVisualizer();
	const edgeOverlayGroupRef = useRef(null);
	const edgeSegmentsRef = useRef([]);
	const activeElementRef = useRef(null);
	const clearEdgeOverlay = useCallback(() => {
		if (scene && edgeOverlayGroupRef.current) {
			scene.remove(edgeOverlayGroupRef.current);
			edgeOverlayGroupRef.current.traverse((child) => {
				if (child instanceof Line2) {
					child.geometry.dispose();
					child.material.dispose();
				}
			});
			edgeOverlayGroupRef.current = null;
		}
		edgeSegmentsRef.current = [];
		activeElementRef.current = null;
	}, [scene]);
	return {
		edgeOverlayGroupRef,
		edgeSegmentsRef,
		activeElementRef,
		buildEdgeOverlays: useCallback(async (nodeId) => {
			if (!scene) return;
			if (activeElementRef.current === nodeId) return;
			clearEdgeOverlay();
			const element = elements.find((el) => el.nodeId === nodeId);
			if (!element) return;
			try {
				const client = OccWorkerClient.getInstance();
				const rotation = element.rotation && (element.rotation.x !== 0 || element.rotation.y !== 0 || element.rotation.z !== 0) ? toEulerJSON(element.rotation) : void 0;
				const edgeData = (await client.send({
					type: "edgeAnalysis",
					payload: {
						brepJson: element.brep.toJSON(),
						position: toVec3(element.position),
						occBrep: element.occBrep,
						rotation,
						allEdges: true
					}
				})).edges;
				edgeSegmentsRef.current = edgeData;
				activeElementRef.current = nodeId;
				const group = new THREE.Group();
				group.userData.isMeasureEdgeOverlay = true;
				for (const edge of edgeData) {
					const pairs = edge.segments;
					const strip = [];
					for (let i = 0; i < pairs.length; i += 6) {
						if (strip.length === 0) strip.push(pairs[i], pairs[i + 1], pairs[i + 2]);
						strip.push(pairs[i + 3], pairs[i + 4], pairs[i + 5]);
					}
					const geometry = new LineGeometry();
					geometry.setPositions(strip);
					const line = new Line2(geometry, new LineMaterial({
						color: MEASURE.edgeHighlight,
						linewidth: FILLET.edgeWidth,
						transparent: true,
						opacity: 0,
						depthTest: false,
						resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
					}));
					line.computeLineDistances();
					line.userData.edgeIndex = edge.edgeIndex;
					line.userData.isMeasureEdge = true;
					line.renderOrder = 999;
					group.add(line);
				}
				scene.add(group);
				edgeOverlayGroupRef.current = group;
				forceSceneUpdate();
			} catch (error) {
				console.error("[useMeasureMode] Failed to build edge overlays:", error);
			}
		}, [
			elements,
			scene,
			forceSceneUpdate,
			clearEdgeOverlay
		]),
		clearEdgeOverlay
	};
}
//#endregion
//#region src/hooks/measure/measure-rendering.ts
function createLine2(positions, color, linewidth, dashed = false) {
	const geometry = new LineGeometry();
	geometry.setPositions(positions);
	const material = new LineMaterial({
		color,
		linewidth,
		dashed,
		...dashed ? {
			dashSize: .15,
			gapSize: .1
		} : {},
		resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
		depthTest: false
	});
	if (dashed) material.defines.USE_DASH = "";
	const line = new Line2(geometry, material);
	line.computeLineDistances();
	line.renderOrder = 999;
	line.userData.isMeasureOverlay = true;
	return line;
}
function createValueSprite(text, position, color = MEASURE.text, bgColor = MEASURE.textBgCss) {
	const canvas = document.createElement("canvas");
	canvas.width = 256;
	canvas.height = 64;
	const ctx = canvas.getContext("2d");
	ctx.font = "bold 28px sans-serif";
	const textWidth = ctx.measureText(text).width;
	const padX = 16;
	const padY = 8;
	const bgWidth = Math.min(textWidth + padX * 2, 256);
	const bgX = (256 - bgWidth) / 2;
	ctx.fillStyle = bgColor;
	ctx.beginPath();
	ctx.roundRect(bgX, padY, bgWidth, 64 - padY * 2, 6);
	ctx.fill();
	ctx.fillStyle = "#" + new THREE.Color(color).getHexString();
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(text, 128, 32);
	const texture = new THREE.CanvasTexture(canvas);
	const material = new THREE.SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false
	});
	const sprite = new THREE.Sprite(material);
	sprite.position.copy(position);
	sprite.scale.set(1.2, .3, 1);
	sprite.renderOrder = 1001;
	sprite.userData.isMeasureOverlay = true;
	return sprite;
}
function createPointMarker(position, color = MEASURE.point) {
	const geometry = new THREE.SphereGeometry(.04, 12, 12);
	const material = new THREE.MeshBasicMaterial({
		color,
		depthTest: false
	});
	const mesh = new THREE.Mesh(geometry, material);
	mesh.position.copy(position);
	mesh.renderOrder = 1e3;
	mesh.userData.isMeasureOverlay = true;
	return mesh;
}
function tagOverlays(overlays, measurementId) {
	for (const obj of overlays) {
		obj.userData.measurementId = measurementId;
		obj.traverse((child) => {
			child.userData.measurementId = measurementId;
		});
	}
}
function buildDistanceAnnotation(pointA, pointB, distance, pinned = false) {
	const objects = [];
	const color = pinned ? MEASURE.pinnedLine : MEASURE.line;
	const textColor = pinned ? MEASURE.pinnedText : MEASURE.text;
	const line = createLine2([
		pointA.x,
		pointA.y,
		pointA.z,
		pointB.x,
		pointB.y,
		pointB.z
	], color, 1.5);
	objects.push(line);
	const markerA = createPointMarker(pointA);
	const markerB = createPointMarker(pointB);
	objects.push(markerA, markerB);
	const mid = pointA.clone().add(pointB).multiplyScalar(.5);
	const dir = pointB.clone().sub(pointA).normalize();
	const up = new THREE.Vector3(0, 1, 0);
	const perp = dir.clone().cross(up);
	if (perp.length() < .01) perp.set(1, 0, 0);
	perp.normalize().multiplyScalar(.15);
	const labelPos = mid.clone().add(perp);
	const label = createValueSprite(distance.toFixed(3), labelPos, textColor);
	objects.push(label);
	return objects;
}
function buildEdgeLengthAnnotation(edgeData, length, pinned = false) {
	const objects = [];
	const color = pinned ? MEASURE.pinnedLine : MEASURE.edgeHighlight;
	const textColor = pinned ? MEASURE.pinnedText : MEASURE.text;
	const positions = [];
	for (let i = 0; i < edgeData.segments.length; i++) positions.push(edgeData.segments[i]);
	if (positions.length >= 6) {
		const edgeLine = createLine2(positions, color, 2);
		objects.push(edgeLine);
	}
	const labelPos = new THREE.Vector3(edgeData.midpoint.x, edgeData.midpoint.y + .2, edgeData.midpoint.z);
	const label = createValueSprite(`L: ${length.toFixed(3)}`, labelPos, textColor);
	objects.push(label);
	return objects;
}
function buildAngleAnnotation(vertex, dirA, dirB, angleDeg, pinned = false) {
	const objects = [];
	const color = pinned ? MEASURE.pinnedLine : MEASURE.angleArc;
	const textColor = pinned ? MEASURE.pinnedText : MEASURE.text;
	const lineLen = .5;
	const endA = vertex.clone().add(dirA.clone().normalize().multiplyScalar(lineLen));
	const endB = vertex.clone().add(dirB.clone().normalize().multiplyScalar(lineLen));
	const lineA = createLine2([
		vertex.x,
		vertex.y,
		vertex.z,
		endA.x,
		endA.y,
		endA.z
	], color, 1.5);
	objects.push(lineA);
	const lineB = createLine2([
		vertex.x,
		vertex.y,
		vertex.z,
		endB.x,
		endB.y,
		endB.z
	], color, 1.5);
	objects.push(lineB);
	const arcRadius = .3;
	const angleRad = angleDeg * (Math.PI / 180);
	const segments = Math.max(8, Math.ceil(angleDeg / 5));
	const nA = dirA.clone().normalize();
	const nB = dirB.clone().normalize();
	const axis = nA.clone().cross(nB).normalize();
	if (axis.length() < .001) {
		const labelPos = vertex.clone().add(nA.clone().multiplyScalar(.35));
		const label = createValueSprite(`${angleDeg.toFixed(1)}°`, labelPos, textColor);
		objects.push(label);
		return objects;
	}
	const arcPositions = [];
	for (let i = 0; i <= segments; i++) {
		const t = i / segments * angleRad;
		const q = new THREE.Quaternion().setFromAxisAngle(axis, t);
		const pt = nA.clone().applyQuaternion(q).multiplyScalar(arcRadius).add(vertex);
		arcPositions.push(pt.x, pt.y, pt.z);
	}
	if (arcPositions.length >= 6) {
		const arcLine = createLine2(arcPositions, color, 1.5);
		objects.push(arcLine);
	}
	const midAngle = angleRad / 2;
	const qMid = new THREE.Quaternion().setFromAxisAngle(axis, midAngle);
	const labelDir = nA.clone().applyQuaternion(qMid).normalize();
	const labelPos = vertex.clone().add(labelDir.multiplyScalar(arcRadius + .2));
	const label = createValueSprite(`${angleDeg.toFixed(1)}°`, labelPos, textColor);
	objects.push(label);
	const marker = createPointMarker(vertex);
	objects.push(marker);
	return objects;
}
//#endregion
//#region src/hooks/measure/hooks/useMeasureInputHandlers.ts
function useMeasureInputHandlers({ stateBag, selection, edgeOverlay, setSubMode }) {
	const { elements, getObject } = useCadCore();
	const { scene, forceSceneUpdate, navToolActiveRef } = useCadVisualizer();
	const { raycasterFromEvent } = useRaycastToObjects();
	const { state, setState, overlayObjectsRef, previewObjectsRef, measurementsRef, pinnedMeasurementsRef, hoveredBodyRef, measureIdRef, selectedMeasurementIdRef, bumpVersion, cleanupPreview, cleanupOverlays, resetBodyHover } = stateBag;
	const { selectMeasurement } = selection;
	const { edgeOverlayGroupRef, edgeSegmentsRef, activeElementRef, buildEdgeOverlays } = edgeOverlay;
	const isApplyingRef = useRef(false);
	const holdRefs = useModeInputHoldRefs();
	const pickTokenRef = useRef(0);
	const subModeRef = useRef(state.subMode);
	subModeRef.current = state.subMode;
	const firstPointRef = useRef(state.firstPoint);
	firstPointRef.current = state.firstPoint;
	const firstEdgeRef = useRef(state.firstEdge);
	firstEdgeRef.current = state.firstEdge;
	const hoveredEdgeIndexRef = useRef(state.hoveredEdgeIndex);
	hoveredEdgeIndexRef.current = state.hoveredEdgeIndex;
	const getPickableObjects = useCallback(() => {
		const objects = [];
		elements.forEach((el) => {
			if (isElement3D(el)) {
				const obj = getObject(el.nodeId);
				if (obj) objects.push(obj);
			}
		});
		return objects;
	}, [elements, getObject]);
	const findElementByHit = useCallback((hitObject) => {
		for (const el of elements) {
			if (!isElement3D(el)) continue;
			const obj = getObject(el.nodeId);
			if (obj && isDescendantOf(hitObject, obj)) return el;
		}
		return null;
	}, [elements, getObject]);
	const addAnnotationToScene = useCallback((objs) => {
		if (!scene) return;
		for (const obj of objs) scene.add(obj);
	}, [scene]);
	const handleDistancePick = useCallback((raycaster) => {
		const objects = getPickableObjects();
		const intersects = raycaster.intersectObjects(objects, true);
		if (intersects.length === 0) return;
		const hit = intersects[0];
		const hitElement = findElementByHit(hit.object);
		if (!hitElement) return;
		let worldPoint = hit.point.clone();
		const snap = findNearestVertex(worldPoint, hitElement, .15);
		if (snap) worldPoint = snap.position;
		if (!firstPointRef.current) {
			cleanupPreview();
			const marker = createPointMarker(worldPoint);
			if (scene) {
				scene.add(marker);
				overlayObjectsRef.current.push(marker);
			}
			setState((prev) => ({
				...prev,
				firstPoint: worldPoint,
				statusText: "Click second point"
			}));
			forceSceneUpdate();
			return;
		}
		cleanupPreview();
		cleanupOverlays();
		const distance = computePointDistance(firstPointRef.current, worldPoint);
		const overlays = buildDistanceAnnotation(firstPointRef.current, worldPoint, distance);
		addAnnotationToScene(overlays);
		measureIdRef.current++;
		const measureId = `measure-${measureIdRef.current}`;
		tagOverlays(overlays, measureId);
		const measurement = {
			type: "distance",
			id: measureId,
			pointA: firstPointRef.current.clone(),
			pointB: worldPoint.clone(),
			distance,
			pinned: false,
			overlayObjects: overlays
		};
		measurementsRef.current.push(measurement);
		bumpVersion();
		setState((prev) => ({
			...prev,
			firstPoint: null,
			statusText: `Distance: ${distance.toFixed(3)}, Click first point for new measurement`
		}));
		forceSceneUpdate();
	}, [
		scene,
		addAnnotationToScene,
		getPickableObjects,
		findElementByHit,
		cleanupPreview,
		cleanupOverlays,
		bumpVersion,
		forceSceneUpdate,
		setState,
		measurementsRef,
		measureIdRef,
		overlayObjectsRef
	]);
	const handleEdgeLengthPick = useCallback(async (raycaster) => {
		if (!edgeOverlayGroupRef.current) return;
		const edgeObjects = [];
		edgeOverlayGroupRef.current.traverse((child) => {
			if (child instanceof Line2) edgeObjects.push(child);
		});
		raycaster.params.Line2 = { threshold: 8 };
		const edgeIntersects = raycaster.intersectObjects(edgeObjects);
		if (edgeIntersects.length === 0) return;
		const edgeIndex = edgeIntersects[0].object.userData.edgeIndex;
		const elementId = activeElementRef.current;
		if (!elementId) return;
		const element = elements.find((el) => el.nodeId === elementId);
		if (!element) return;
		const myToken = pickTokenRef.current;
		try {
			const client = OccWorkerClient.getInstance();
			const rotation = element.rotation && (element.rotation.x !== 0 || element.rotation.y !== 0 || element.rotation.z !== 0) ? toEulerJSON(element.rotation) : void 0;
			const lengthResult = await client.send({
				type: "edgeLength",
				payload: {
					brepJson: element.brep.toJSON(),
					position: toVec3(element.position),
					edgeIndex,
					occBrep: element.occBrep,
					rotation
				}
			});
			if (pickTokenRef.current !== myToken) return;
			const length = lengthResult.length;
			const edgeData = edgeSegmentsRef.current.find((e) => e.edgeIndex === edgeIndex);
			if (!edgeData) return;
			const overlays = buildEdgeLengthAnnotation(edgeData, length);
			addAnnotationToScene(overlays);
			measureIdRef.current++;
			const measureId = `measure-${measureIdRef.current}`;
			tagOverlays(overlays, measureId);
			const measurement = {
				type: "edge-length",
				id: measureId,
				elementNodeId: elementId,
				edgeIndex,
				edgeSegments: edgeData.segments,
				midpoint: edgeData.midpoint,
				length,
				pinned: false,
				overlayObjects: overlays
			};
			measurementsRef.current.push(measurement);
			bumpVersion();
			setState((prev) => ({
				...prev,
				statusText: `Edge length: ${length.toFixed(3)}, Hover and click another edge`
			}));
			forceSceneUpdate();
		} catch (error) {
			console.error("[useMeasureMode] Edge length measurement failed:", error);
		}
	}, [
		elements,
		addAnnotationToScene,
		bumpVersion,
		forceSceneUpdate,
		setState,
		activeElementRef,
		edgeOverlayGroupRef,
		edgeSegmentsRef,
		measureIdRef,
		measurementsRef
	]);
	const handleAnglePick = useCallback(async (raycaster) => {
		if (!edgeOverlayGroupRef.current) return;
		const edgeObjects = [];
		edgeOverlayGroupRef.current.traverse((child) => {
			if (child instanceof Line2) edgeObjects.push(child);
		});
		raycaster.params.Line2 = { threshold: 8 };
		const edgeIntersects = raycaster.intersectObjects(edgeObjects);
		if (edgeIntersects.length === 0) return;
		const edgeIndex = edgeIntersects[0].object.userData.edgeIndex;
		const elementId = activeElementRef.current;
		if (!elementId) return;
		const firstEdge = firstEdgeRef.current;
		if (!firstEdge) {
			edgeOverlayGroupRef.current.children.forEach((child) => {
				if (child instanceof Line2 && child.userData.isMeasureEdge) {
					const mat = child.material;
					if (child.userData.edgeIndex === edgeIndex) {
						mat.color.set(MEASURE.edgeHighlight);
						mat.opacity = 1;
					}
				}
			});
			setState((prev) => ({
				...prev,
				firstEdge: {
					elementId,
					edgeIndex
				},
				statusText: "Click second edge for angle measurement"
			}));
			forceSceneUpdate();
			return;
		}
		const myToken = pickTokenRef.current;
		try {
			const element = elements.find((el) => el.nodeId === firstEdge.elementId);
			if (!element) return;
			const client = OccWorkerClient.getInstance();
			const rotation = element.rotation && (element.rotation.x !== 0 || element.rotation.y !== 0 || element.rotation.z !== 0) ? toEulerJSON(element.rotation) : void 0;
			const [resultA, resultB] = await Promise.all([client.send({
				type: "edgeDirection",
				payload: {
					brepJson: element.brep.toJSON(),
					position: toVec3(element.position),
					edgeIndex: firstEdge.edgeIndex,
					occBrep: element.occBrep,
					rotation
				}
			}), client.send({
				type: "edgeDirection",
				payload: {
					brepJson: element.brep.toJSON(),
					position: toVec3(element.position),
					edgeIndex,
					occBrep: element.occBrep,
					rotation
				}
			})]);
			if (pickTokenRef.current !== myToken) return;
			const dirA = resultA.direction;
			const dirB = resultB.direction;
			const vecA = new THREE.Vector3(dirA.x, dirA.y, dirA.z);
			const vecB = new THREE.Vector3(dirB.x, dirB.y, dirB.z);
			const edgeA = edgeSegmentsRef.current.find((e) => e.edgeIndex === firstEdge.edgeIndex);
			const edgeB = edgeSegmentsRef.current.find((e) => e.edgeIndex === edgeIndex);
			let vertex;
			if (edgeA && edgeB) {
				const aStart = new THREE.Vector3(edgeA.segments[0], edgeA.segments[1], edgeA.segments[2]);
				const aEnd = new THREE.Vector3(edgeA.segments[edgeA.segments.length - 3], edgeA.segments[edgeA.segments.length - 2], edgeA.segments[edgeA.segments.length - 1]);
				const bStart = new THREE.Vector3(edgeB.segments[0], edgeB.segments[1], edgeB.segments[2]);
				const bEnd = new THREE.Vector3(edgeB.segments[edgeB.segments.length - 3], edgeB.segments[edgeB.segments.length - 2], edgeB.segments[edgeB.segments.length - 1]);
				const pairs = [
					{
						point: aStart,
						dist: Math.min(aStart.distanceTo(bStart), aStart.distanceTo(bEnd))
					},
					{
						point: aEnd,
						dist: Math.min(aEnd.distanceTo(bStart), aEnd.distanceTo(bEnd))
					},
					{
						point: bStart,
						dist: Math.min(bStart.distanceTo(aStart), bStart.distanceTo(aEnd))
					},
					{
						point: bEnd,
						dist: Math.min(bEnd.distanceTo(aStart), bEnd.distanceTo(aEnd))
					}
				];
				pairs.sort((a, b) => a.dist - b.dist);
				vertex = pairs[0].point;
			} else vertex = new THREE.Vector3(edgeA?.midpoint.x ?? 0, edgeA?.midpoint.y ?? 0, edgeA?.midpoint.z ?? 0);
			if (edgeA) {
				const toMidA = new THREE.Vector3(edgeA.midpoint.x, edgeA.midpoint.y, edgeA.midpoint.z).clone().sub(vertex);
				if (toMidA.lengthSq() < 1e-8) toMidA.set(edgeA.segments[edgeA.segments.length - 3] - vertex.x, edgeA.segments[edgeA.segments.length - 2] - vertex.y, edgeA.segments[edgeA.segments.length - 1] - vertex.z);
				if (vecA.dot(toMidA) < 0) vecA.negate();
			}
			if (edgeB) {
				const toMidB = new THREE.Vector3(edgeB.midpoint.x, edgeB.midpoint.y, edgeB.midpoint.z).clone().sub(vertex);
				if (toMidB.lengthSq() < 1e-8) toMidB.set(edgeB.segments[edgeB.segments.length - 3] - vertex.x, edgeB.segments[edgeB.segments.length - 2] - vertex.y, edgeB.segments[edgeB.segments.length - 1] - vertex.z);
				if (vecB.dot(toMidB) < 0) vecB.negate();
			}
			const angleDeg = computeAngleBetweenVectors(vecA, vecB);
			const overlays = buildAngleAnnotation(vertex, vecA, vecB, angleDeg);
			addAnnotationToScene(overlays);
			measureIdRef.current++;
			const measureId = `measure-${measureIdRef.current}`;
			tagOverlays(overlays, measureId);
			const measurement = {
				type: "angle",
				id: measureId,
				vertex: vertex.clone(),
				directionA: vecA.clone(),
				directionB: vecB.clone(),
				angleDegrees: angleDeg,
				pinned: false,
				overlayObjects: overlays
			};
			measurementsRef.current.push(measurement);
			bumpVersion();
			edgeOverlayGroupRef.current?.children.forEach((child) => {
				if (child instanceof Line2 && child.userData.isMeasureEdge) child.material.opacity = 0;
			});
			setState((prev) => ({
				...prev,
				firstEdge: null,
				secondEdge: null,
				statusText: `Angle: ${angleDeg.toFixed(1)}°, Click first edge for new angle`
			}));
			forceSceneUpdate();
		} catch (error) {
			console.error("[useMeasureMode] Angle measurement failed:", error);
		}
	}, [
		elements,
		addAnnotationToScene,
		bumpVersion,
		forceSceneUpdate,
		setState,
		activeElementRef,
		edgeOverlayGroupRef,
		edgeSegmentsRef,
		measureIdRef,
		measurementsRef
	]);
	const onMeasureMouseMove = useCallback((event) => {
		const raycaster = raycasterFromEvent(event);
		if (!raycaster) return;
		if (subModeRef.current === "distance") if (firstPointRef.current) {
			const objects = getPickableObjects();
			const intersects = raycaster.intersectObjects(objects, true);
			if (intersects.length > 0) {
				const hit = intersects[0];
				const hitElement = findElementByHit(hit.object);
				let worldPoint = hit.point.clone();
				if (hitElement) {
					const snap = findNearestVertex(worldPoint, hitElement, .15);
					if (snap) worldPoint = snap.position;
				}
				cleanupPreview();
				const dist = computePointDistance(firstPointRef.current, worldPoint);
				const previewLine = createLine2([
					firstPointRef.current.x,
					firstPointRef.current.y,
					firstPointRef.current.z,
					worldPoint.x,
					worldPoint.y,
					worldPoint.z
				], MEASURE.lineHover, 1, true);
				if (scene) {
					scene.add(previewLine);
					previewObjectsRef.current.push(previewLine);
				}
				const mid = firstPointRef.current.clone().add(worldPoint).multiplyScalar(.5);
				mid.y += .15;
				const label = createValueSprite(`${dist.toFixed(3)}`, mid, MEASURE.lineHover);
				if (scene) {
					scene.add(label);
					previewObjectsRef.current.push(label);
				}
				forceSceneUpdate();
			}
		} else {
			const objects = getPickableObjects();
			const intersects = raycaster.intersectObjects(objects, true);
			if (intersects.length > 0) {
				const hitElement = findElementByHit(intersects[0].object);
				if (hitElement && hitElement.nodeId !== hoveredBodyRef.current) {
					resetBodyHover();
					hoveredBodyRef.current = hitElement.nodeId;
					const obj = getObject(hitElement.nodeId);
					if (obj) obj.traverse((child) => {
						if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) child.material.color.set(SELECTION.hover);
					});
					forceSceneUpdate();
				} else if (!hitElement && hoveredBodyRef.current) {
					resetBodyHover();
					forceSceneUpdate();
				}
			} else if (hoveredBodyRef.current) {
				resetBodyHover();
				forceSceneUpdate();
			}
		}
		else if (subModeRef.current === "edge-length" || subModeRef.current === "angle") {
			const objects = getPickableObjects();
			const intersects = raycaster.intersectObjects(objects, true);
			if (intersects.length > 0) {
				const hitElement = findElementByHit(intersects[0].object);
				if (hitElement) {
					if (activeElementRef.current !== hitElement.nodeId) buildEdgeOverlays(hitElement.nodeId);
					if (edgeOverlayGroupRef.current) {
						const edgeObjects = [];
						edgeOverlayGroupRef.current.traverse((child) => {
							if (child instanceof THREE.LineSegments) edgeObjects.push(child);
						});
						raycaster.params.Line2 = { threshold: 8 };
						const edgeIntersects = raycaster.intersectObjects(edgeObjects);
						let newHovered = null;
						if (edgeIntersects.length > 0) newHovered = edgeIntersects[0].object.userData.edgeIndex;
						if (newHovered !== hoveredEdgeIndexRef.current) {
							edgeOverlayGroupRef.current.children.forEach((child) => {
								if (child instanceof Line2 && child.userData.isMeasureEdge) {
									const idx = child.userData.edgeIndex;
									const mat = child.material;
									const firstEdge = firstEdgeRef.current;
									if (subModeRef.current === "angle" && firstEdge && idx === firstEdge.edgeIndex) {
										mat.color.set(MEASURE.edgeHighlight);
										mat.opacity = 1;
									} else if (idx === newHovered) {
										mat.color.set(MEASURE.lineHover);
										mat.opacity = 1;
									} else mat.opacity = 0;
								}
							});
							setState((prev) => ({
								...prev,
								hoveredEdgeIndex: newHovered,
								hoveredElementId: hitElement.nodeId
							}));
							forceSceneUpdate();
						}
					}
					if (hitElement.nodeId !== hoveredBodyRef.current) {
						resetBodyHover();
						hoveredBodyRef.current = hitElement.nodeId;
						const obj = getObject(hitElement.nodeId);
						if (obj) obj.traverse((child) => {
							if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) child.material.color.set(SELECTION.hover);
						});
					}
				}
			} else {
				if (edgeOverlayGroupRef.current) edgeOverlayGroupRef.current.children.forEach((child) => {
					if (child instanceof Line2 && child.userData.isMeasureEdge) {
						const mat = child.material;
						const firstEdge = firstEdgeRef.current;
						if (subModeRef.current === "angle" && firstEdge && child.userData.edgeIndex === firstEdge.edgeIndex) {
							mat.color.set(MEASURE.edgeHighlight);
							mat.opacity = 1;
						} else mat.opacity = 0;
					}
				});
				if (hoveredEdgeIndexRef.current !== null) setState((prev) => ({
					...prev,
					hoveredEdgeIndex: null,
					hoveredElementId: null
				}));
				if (hoveredBodyRef.current) resetBodyHover();
				forceSceneUpdate();
			}
		}
	}, [
		raycasterFromEvent,
		getPickableObjects,
		findElementByHit,
		getObject,
		buildEdgeOverlays,
		cleanupPreview,
		resetBodyHover,
		forceSceneUpdate,
		previewObjectsRef,
		hoveredBodyRef,
		edgeOverlayGroupRef,
		activeElementRef,
		setState,
		scene
	]);
	const handlers = useMemo(() => createModeInputHandlers({
		pickTargets: (raycaster) => {
			const measureOverlayObjects = [];
			for (const m of measurementsRef.current) measureOverlayObjects.push(...m.overlayObjects);
			for (const m of pinnedMeasurementsRef.current) measureOverlayObjects.push(...m.overlayObjects);
			if (measureOverlayObjects.length > 0) {
				raycaster.params.Line2 = { threshold: 6 };
				const measureHits = raycaster.intersectObjects(measureOverlayObjects, true);
				if (measureHits.length > 0) {
					const hitMeasureId = measureHits[0].object.userData.measurementId;
					if (hitMeasureId) return {
						picks: [],
						resolved: {
							kind: "measurement-row",
							measureId: hitMeasureId
						}
					};
				}
			}
			return {
				picks: [],
				resolved: {
					kind: "raycast",
					raycaster
				}
			};
		},
		onPickStart: (resolved) => {
			pickTokenRef.current++;
			if (resolved.kind === "measurement-row") {
				selectMeasurement(resolved.measureId === selectedMeasurementIdRef.current ? null : resolved.measureId);
				return;
			}
			if (selectedMeasurementIdRef.current) selectMeasurement(null);
			if (subModeRef.current === "distance") handleDistancePick(resolved.raycaster);
			else if (subModeRef.current === "edge-length") handleEdgeLengthPick(resolved.raycaster);
			else if (subModeRef.current === "angle") handleAnglePick(resolved.raycaster);
		},
		onPickFromMenu: () => {},
		onCancel: () => {
			if (subModeRef.current === "distance" && firstPointRef.current) {
				cleanupPreview();
				cleanupOverlays();
				setState((prev) => ({
					...prev,
					firstPoint: null,
					statusText: "Click first point"
				}));
				forceSceneUpdate();
			} else if (subModeRef.current === "angle" && firstEdgeRef.current) {
				if (edgeOverlayGroupRef.current) edgeOverlayGroupRef.current.children.forEach((child) => {
					if (child instanceof Line2 && child.userData.isMeasureEdge) child.material.opacity = 0;
				});
				setState((prev) => ({
					...prev,
					firstEdge: null,
					statusText: "Click first edge"
				}));
				forceSceneUpdate();
			}
		},
		extraKeys: {
			d: () => {
				pickTokenRef.current++;
				setSubMode("distance");
			},
			D: () => {
				pickTokenRef.current++;
				setSubMode("distance");
			},
			e: () => {
				pickTokenRef.current++;
				setSubMode("edge-length");
			},
			E: () => {
				pickTokenRef.current++;
				setSubMode("edge-length");
			},
			a: () => {
				pickTokenRef.current++;
				setSubMode("angle");
			},
			A: () => {
				pickTokenRef.current++;
				setSubMode("angle");
			}
		}
	}, {
		raycasterFromEvent,
		selectOtherRef: void 0,
		navToolActiveRef,
		isApplyingRef
	}, holdRefs), [
		raycasterFromEvent,
		navToolActiveRef,
		handleDistancePick,
		handleEdgeLengthPick,
		handleAnglePick,
		selectMeasurement,
		selectedMeasurementIdRef,
		cleanupPreview,
		cleanupOverlays,
		forceSceneUpdate,
		setState,
		edgeOverlayGroupRef,
		measurementsRef,
		pinnedMeasurementsRef,
		setSubMode,
		holdRefs
	]);
	const handleKeyDown = useCallback((event) => {
		if (event.target?.tagName === "INPUT") return;
		handlers.handleKeyDown(event);
	}, [handlers]);
	return {
		handleMouseDown: handlers.handleMouseDown,
		handleMouseMove: onMeasureMouseMove,
		handleKeyDown
	};
}
//#endregion
//#region src/hooks/measure/hooks/useMeasurementSelection.ts
function useMeasurementSelection({ stateBag }) {
	const { forceSceneUpdate } = useCadVisualizer();
	const { findMeasurementById, selectedMeasurementIdRef, setSelectedMeasurementId } = stateBag;
	const highlightMeasurement = useCallback((measurement) => {
		for (const obj of measurement.overlayObjects) {
			if (obj instanceof Line2) {
				obj.material.color.set(SELECTION.selected);
				obj.material.linewidth = 2.5;
			}
			obj.traverse((child) => {
				if (child instanceof THREE.Mesh && child.userData.isMeasureOverlay) child.material.color.set(SELECTION.selected);
			});
		}
		forceSceneUpdate();
	}, [forceSceneUpdate]);
	const unhighlightMeasurement = useCallback((measurement) => {
		const isPinned = measurement.pinned;
		const lineColor = isPinned ? MEASURE.pinnedLine : measurement.type === "angle" ? MEASURE.angleArc : measurement.type === "edge-length" ? MEASURE.edgeHighlight : MEASURE.line;
		const lineWidth = measurement.type === "edge-length" ? 2 : 1.5;
		const pointColor = isPinned ? MEASURE.pinnedLine : MEASURE.point;
		for (const obj of measurement.overlayObjects) {
			if (obj instanceof Line2) {
				obj.material.color.set(lineColor);
				obj.material.linewidth = lineWidth;
			}
			obj.traverse((child) => {
				if (child instanceof THREE.Mesh && child.userData.isMeasureOverlay) child.material.color.set(pointColor);
			});
		}
		forceSceneUpdate();
	}, [forceSceneUpdate]);
	return {
		selectMeasurement: useCallback((id) => {
			const prevId = selectedMeasurementIdRef.current;
			if (prevId) {
				const prev = findMeasurementById(prevId);
				if (prev) unhighlightMeasurement(prev);
			}
			if (id) {
				const next = findMeasurementById(id);
				if (next) highlightMeasurement(next);
			}
			selectedMeasurementIdRef.current = id;
			setSelectedMeasurementId(id);
		}, [
			findMeasurementById,
			highlightMeasurement,
			unhighlightMeasurement,
			selectedMeasurementIdRef,
			setSelectedMeasurementId
		]),
		highlightMeasurement,
		unhighlightMeasurement
	};
}
//#endregion
//#region src/hooks/measure/hooks/useMeasurementState.ts
function useMeasurementState() {
	const { pinnedMeasurements, addPinnedMeasurement, removePinnedMeasurement, getObject } = useCadCore();
	const { scene, forceSceneUpdate } = useCadVisualizer();
	const [state, setState] = useState({
		subMode: "distance",
		firstPoint: null,
		hoveredEdgeIndex: null,
		hoveredElementId: null,
		firstEdge: null,
		secondEdge: null,
		statusText: "Click first point"
	});
	const overlayObjectsRef = useRef([]);
	const previewObjectsRef = useRef([]);
	const measurementsRef = useRef([]);
	const hoveredBodyRef = useRef(null);
	const measureIdRef = useRef(0);
	const [selectedMeasurementId, setSelectedMeasurementId] = useState(null);
	const selectedMeasurementIdRef = useRef(null);
	useEffect(() => {
		selectedMeasurementIdRef.current = selectedMeasurementId;
	}, [selectedMeasurementId]);
	const pinnedMeasurementsRef = useRef(pinnedMeasurements);
	useEffect(() => {
		pinnedMeasurementsRef.current = pinnedMeasurements;
	}, [pinnedMeasurements]);
	const [, setMeasurementVersion] = useState(0);
	const bumpVersion = useCallback(() => setMeasurementVersion((v) => v + 1), []);
	const cleanupPreview = useCallback(() => {
		for (const obj of previewObjectsRef.current) disposeMeasureOverlay(obj);
		previewObjectsRef.current = [];
	}, []);
	const cleanupOverlays = useCallback(() => {
		for (const obj of overlayObjectsRef.current) disposeMeasureOverlay(obj);
		overlayObjectsRef.current = [];
	}, []);
	const cleanupMeasurements = useCallback(() => {
		for (const m of measurementsRef.current) for (const obj of m.overlayObjects) disposeMeasureOverlay(obj);
		measurementsRef.current = [];
		bumpVersion();
	}, [bumpVersion]);
	return {
		state,
		setState,
		overlayObjectsRef,
		previewObjectsRef,
		measurementsRef,
		hoveredBodyRef,
		measureIdRef,
		selectedMeasurementId,
		selectedMeasurementIdRef,
		setSelectedMeasurementId,
		pinnedMeasurementsRef,
		bumpVersion,
		cleanupPreview,
		cleanupOverlays,
		cleanupMeasurements,
		resetBodyHover: useCallback(() => {
			if (hoveredBodyRef.current) {
				const obj = getObject(hoveredBodyRef.current);
				if (obj) obj.traverse((child) => {
					if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) child.material.color.set(BODY.default);
				});
				hoveredBodyRef.current = null;
			}
		}, [getObject]),
		findMeasurementById: useCallback((id) => {
			const temp = measurementsRef.current.find((m) => m.id === id);
			if (temp) return temp;
			return pinnedMeasurementsRef.current.find((m) => m.id === id) ?? null;
		}, []),
		clearTemporaryMeasurements: useCallback(() => {
			cleanupMeasurements();
			setSelectedMeasurementId(null);
			forceSceneUpdate();
		}, [cleanupMeasurements, forceSceneUpdate]),
		pinMeasurement: useCallback((id) => {
			const resolvedId = id ?? selectedMeasurementIdRef.current ?? (measurementsRef.current.length > 0 ? measurementsRef.current[measurementsRef.current.length - 1].id : null);
			if (!resolvedId) return false;
			const measurement = measurementsRef.current.find((m) => m.id === resolvedId);
			if (!measurement || measurement.pinned) return false;
			for (const obj of measurement.overlayObjects) if (obj instanceof Line2) obj.material.color.set(MEASURE.pinnedLine);
			measurementsRef.current = measurementsRef.current.filter((m) => m.id !== resolvedId);
			addPinnedMeasurement(measurement);
			if (selectedMeasurementIdRef.current === resolvedId) {
				selectedMeasurementIdRef.current = null;
				setSelectedMeasurementId(null);
			}
			bumpVersion();
			return true;
		}, [addPinnedMeasurement, bumpVersion]),
		unpinMeasurement: useCallback((id) => {
			const targetId = id ?? selectedMeasurementIdRef.current;
			if (!targetId) return false;
			const measurement = pinnedMeasurementsRef.current.find((m) => m.id === targetId);
			if (!measurement) return false;
			removePinnedMeasurement(measurement.id);
			let newOverlays = [];
			if (measurement.type === "distance") newOverlays = buildDistanceAnnotation(measurement.pointA, measurement.pointB, measurement.distance, false);
			else if (measurement.type === "edge-length") newOverlays = buildEdgeLengthAnnotation({
				edgeIndex: measurement.edgeIndex,
				segments: measurement.edgeSegments,
				midpoint: measurement.midpoint
			}, measurement.length, false);
			else if (measurement.type === "angle") newOverlays = buildAngleAnnotation(measurement.vertex, measurement.directionA, measurement.directionB, measurement.angleDegrees, false);
			if (scene) for (const obj of newOverlays) scene.add(obj);
			measureIdRef.current++;
			const newId = `measure-${measureIdRef.current}`;
			tagOverlays(newOverlays, newId);
			const newMeasurement = {
				...measurement,
				id: newId,
				pinned: false,
				overlayObjects: newOverlays
			};
			measurementsRef.current.push(newMeasurement);
			if (selectedMeasurementIdRef.current === targetId) {
				selectedMeasurementIdRef.current = null;
				setSelectedMeasurementId(null);
			}
			bumpVersion();
			forceSceneUpdate();
			return true;
		}, [
			removePinnedMeasurement,
			scene,
			forceSceneUpdate,
			bumpVersion
		]),
		deleteMeasurement: useCallback((id) => {
			const targetId = id ?? selectedMeasurementIdRef.current;
			if (!targetId) return false;
			const tempIdx = measurementsRef.current.findIndex((m) => m.id === targetId);
			if (tempIdx !== -1) {
				const measurement = measurementsRef.current[tempIdx];
				for (const obj of measurement.overlayObjects) disposeMeasureOverlay(obj);
				measurementsRef.current.splice(tempIdx, 1);
				if (selectedMeasurementIdRef.current === targetId) {
					selectedMeasurementIdRef.current = null;
					setSelectedMeasurementId(null);
				}
				bumpVersion();
				forceSceneUpdate();
				return true;
			}
			const pinned = pinnedMeasurementsRef.current.find((m) => m.id === targetId);
			if (pinned) {
				removePinnedMeasurement(pinned.id);
				if (selectedMeasurementIdRef.current === targetId) {
					selectedMeasurementIdRef.current = null;
					setSelectedMeasurementId(null);
				}
				forceSceneUpdate();
				return true;
			}
			return false;
		}, [
			removePinnedMeasurement,
			forceSceneUpdate,
			bumpVersion
		])
	};
}
//#endregion
//#region src/hooks/useMeasureMode.ts
function useMeasureMode() {
	const stateBag = useMeasurementState();
	const selection = useMeasurementSelection({ stateBag });
	const edgeOverlay = useEdgeOverlay();
	const { state, setState, cleanupPreview, cleanupOverlays, cleanupMeasurements, resetBodyHover, setSelectedMeasurementId, measurementsRef, selectedMeasurementId, clearTemporaryMeasurements, pinMeasurement, unpinMeasurement, deleteMeasurement } = stateBag;
	const { clearEdgeOverlay } = edgeOverlay;
	const setSubMode = useCallback((newSubMode) => {
		cleanupPreview();
		cleanupOverlays();
		clearEdgeOverlay();
		resetBodyHover();
		setState({
			subMode: newSubMode,
			firstPoint: null,
			hoveredEdgeIndex: null,
			hoveredElementId: null,
			firstEdge: null,
			secondEdge: null,
			statusText: newSubMode === "distance" ? "Click first point" : newSubMode === "edge-length" ? "Hover over an edge and click" : "Click first edge"
		});
	}, [
		cleanupPreview,
		cleanupOverlays,
		clearEdgeOverlay,
		resetBodyHover,
		setState
	]);
	const handlers = useMeasureInputHandlers({
		stateBag,
		selection,
		edgeOverlay,
		setSubMode
	});
	const cleanup = useCallback(() => {
		cleanupPreview();
		cleanupOverlays();
		clearEdgeOverlay();
		cleanupMeasurements();
		resetBodyHover();
		setSelectedMeasurementId(null);
		setState({
			subMode: "distance",
			firstPoint: null,
			hoveredEdgeIndex: null,
			hoveredElementId: null,
			firstEdge: null,
			secondEdge: null,
			statusText: "Click first point"
		});
	}, [
		cleanupPreview,
		cleanupOverlays,
		clearEdgeOverlay,
		cleanupMeasurements,
		resetBodyHover,
		setSelectedMeasurementId,
		setState
	]);
	const cleanupRef = useRef(cleanup);
	cleanupRef.current = cleanup;
	useEffect(() => () => cleanupRef.current(), []);
	return {
		subMode: state.subMode,
		statusText: state.statusText,
		firstPoint: state.firstPoint,
		firstEdge: state.firstEdge,
		handleMouseDown: handlers.handleMouseDown,
		handleMouseMove: handlers.handleMouseMove,
		handleKeyDown: handlers.handleKeyDown,
		setSubMode,
		clearTemporaryMeasurements,
		cleanup,
		measurements: measurementsRef.current,
		selectedMeasurementId,
		selectMeasurement: selection.selectMeasurement,
		pinMeasurement,
		unpinMeasurement,
		deleteMeasurement
	};
}
//#endregion
//#region src/hooks/revolve/revolve-helpers.ts
/**
* Normalize an axis defined by two endpoints into origin + unit direction.
* Returns null if the axis has zero length (caller should surface an error).
*/
function normalizeAxis(start, end) {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const dz = end.z - start.z;
	const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
	if (len < 1e-10) return null;
	return {
		origin: {
			x: start.x,
			y: start.y,
			z: start.z
		},
		direction: {
			x: dx / len,
			y: dy / len,
			z: dz / len
		}
	};
}
//#endregion
//#region src/hooks/revolve/hooks/useRevolveApply.ts
function useRevolveApply({ stateBag, axisSelection }) {
	const { elements, updateElementBrep } = useCadCore();
	const { state, setState } = stateBag;
	const { removeEdgeOverlay, removeAxisLine } = axisSelection;
	return { performRevolve: useCallback(async (angleDegrees) => {
		const { selectedElement, axisEdgeStart, axisEdgeEnd } = state;
		if (!selectedElement || !axisEdgeStart || !axisEdgeEnd) return;
		const element = elements.find((el) => el.nodeId === selectedElement);
		if (!element) return;
		setState((prev) => ({
			...prev,
			isApplying: true
		}));
		try {
			const finalAngle = angleDegrees ?? state.angle;
			const angleRadians = finalAngle / 180 * Math.PI;
			const angle2Radians = state.angle2 / 180 * Math.PI;
			const axis = normalizeAxis(axisEdgeStart, axisEdgeEnd);
			if (!axis) {
				notify("Invalid axis: edge has zero length", "error");
				setState((prev) => ({
					...prev,
					isApplying: false
				}));
				return;
			}
			const result = await revolveBRep(element.brep, element.position, axis.origin, axis.direction, Math.abs(finalAngle - 360) < .01 ? void 0 : angleRadians, element.occBrep, state.direction, state.direction === "two" ? Math.abs(state.angle2 - 360) < .01 ? void 0 : angle2Radians : void 0);
			if (!result.ok) {
				notify(`Revolve failed: ${result.reason}`, "error");
				setState((prev) => ({
					...prev,
					isApplying: false
				}));
				return;
			}
			const value = result.value;
			const newPosition = new THREE.Vector3(element.position.x + value.positionOffset.x, element.position.y + value.positionOffset.y, element.position.z + value.positionOffset.z);
			debugLog("[revolve diag] performRevolve", {
				elementPosition: element.position.toArray(),
				elementRotation: element.rotation ? [
					element.rotation.x,
					element.rotation.y,
					element.rotation.z,
					element.rotation.order
				] : null,
				axis: {
					origin: axis.origin,
					direction: axis.direction
				},
				finalAngle,
				direction: state.direction,
				positionOffset: value.positionOffset,
				newPosition: newPosition.toArray()
			});
			removeEdgeOverlay();
			removeAxisLine();
			updateElementBrep(selectedElement, value.brep, newPosition, { type: "revolve" }, value.edgeGeometry, value.occBrep, value.faceGeometry, value.vertexPositions);
			notify(state.direction === "symmetric" ? `Revolved ${finalAngle / 2}° + ${finalAngle / 2}° symmetric` : state.direction === "two" ? `Revolved ${finalAngle}° + ${state.angle2}° two sides` : `Revolved ${finalAngle}°`, "success");
			setState({
				phase: "SELECT_PROFILE",
				selectedElement: null,
				axisEdgeStart: null,
				axisEdgeEnd: null,
				angle: 360,
				angle2: 360,
				direction: "one",
				isApplying: false,
				showDimensionInput: false,
				dimensionInputPosition: {
					x: 0,
					y: 0
				}
			});
		} catch (error) {
			console.error("[useRevolveMode] Revolve failed:", error);
			notify(error instanceof Error ? error.message : "Revolve failed", "error");
			setState((prev) => ({
				...prev,
				isApplying: false
			}));
		}
	}, [
		state,
		elements,
		updateElementBrep,
		removeEdgeOverlay,
		removeAxisLine,
		setState
	]) };
}
//#endregion
//#region src/hooks/revolve/hooks/useRevolveAxisSelection.ts
function useRevolveAxisSelection({ stateBag }) {
	const { elements, sketches, getObject } = useCadCore();
	const { scene, forceSceneUpdate } = useCadVisualizer();
	const { state, setState, edgeSegmentsRef, edgeOverlayGroupRef, hoveredEdgeRef, axisLineRef, sketchLineOverlayRef, bodyEdgeOverlayRef } = stateBag;
	/** Build per-edge overlay lines from the selected profile's OCC edge data. */
	const buildEdgeOverlay = useCallback(async (nodeId) => {
		const element = elements.find((el) => el.nodeId === nodeId);
		if (!element) return;
		const edgeDataArr = (await OccWorkerClient.getInstance().send({
			type: "edgeAnalysis",
			payload: {
				brepJson: element.brep.toJSON(),
				position: toVec3(element.position),
				occBrep: element.occBrep,
				rotation: element.rotation ? toEulerJSON(element.rotation) : void 0,
				allEdges: true
			}
		})).edges;
		if (!edgeDataArr || edgeDataArr.length === 0) return;
		edgeSegmentsRef.current = edgeDataArr.map((e) => ({
			edgeIndex: e.edgeIndex,
			segments: e.segments,
			midpoint: e.midpoint
		}));
		const group = new THREE.Group();
		group.userData.isHelper = true;
		for (const edge of edgeSegmentsRef.current) {
			const pairs = edge.segments;
			const strip = [];
			for (let i = 0; i < pairs.length; i += 6) {
				if (strip.length === 0) strip.push(pairs[i], pairs[i + 1], pairs[i + 2]);
				strip.push(pairs[i + 3], pairs[i + 4], pairs[i + 5]);
			}
			const geom = new LineGeometry();
			geom.setPositions(strip);
			const line = new Line2(geom, new LineMaterial({
				color: REVOLVE.axisLine,
				linewidth: FILLET.edgeWidth,
				depthTest: false,
				resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
			}));
			line.computeLineDistances();
			line.renderOrder = 999;
			line.userData.edgeIndex = edge.edgeIndex;
			group.add(line);
		}
		const obj = getObject(nodeId);
		if (obj && obj.parent) obj.parent.add(group);
		else if (scene) scene.add(group);
		edgeOverlayGroupRef.current = group;
		forceSceneUpdate();
	}, [
		elements,
		getObject,
		scene,
		forceSceneUpdate,
		edgeSegmentsRef,
		edgeOverlayGroupRef
	]);
	/** Build overlays for sketch lines from completed sketches (Priority 2 axis source). */
	const buildSketchLineOverlays = useCallback(() => {
		if (!scene) return;
		const group = new THREE.Group();
		group.userData.isHelper = true;
		for (const sketch of sketches) {
			const plane = sketch.plane;
			const points = /* @__PURE__ */ new Map();
			for (const prim of sketch.primitives) if (isSketchPoint(prim)) points.set(prim.id, prim);
			for (const prim of sketch.primitives) {
				if (!isSketchLine(prim)) continue;
				const p1 = points.get(prim.p1Id);
				const p2 = points.get(prim.p2Id);
				if (!p1 || !p2) continue;
				const start3d = plane.origin.clone().add(plane.xAxis.clone().multiplyScalar(p1.x)).add(plane.yAxis.clone().multiplyScalar(p1.y));
				const end3d = plane.origin.clone().add(plane.xAxis.clone().multiplyScalar(p2.x)).add(plane.yAxis.clone().multiplyScalar(p2.y));
				if (start3d.distanceTo(end3d) < 1e-6) continue;
				const geom = new LineGeometry();
				geom.setPositions([
					start3d.x,
					start3d.y,
					start3d.z,
					end3d.x,
					end3d.y,
					end3d.z
				]);
				const line = new Line2(geom, new LineMaterial({
					color: REVOLVE.sketchLineAxis,
					linewidth: FILLET.edgeWidth,
					depthTest: false,
					resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
				}));
				line.computeLineDistances();
				line.renderOrder = 999;
				line.userData.sketchLineStart = start3d;
				line.userData.sketchLineEnd = end3d;
				line.userData.axisSourceType = "sketchLine";
				group.add(line);
			}
		}
		if (group.children.length > 0) {
			scene.add(group);
			sketchLineOverlayRef.current = group;
			forceSceneUpdate();
		}
	}, [
		sketches,
		scene,
		forceSceneUpdate,
		sketchLineOverlayRef
	]);
	/** Build overlays for linear edges of other 3D bodies (Priority 3 axis source). */
	const buildOtherBodyEdgeOverlays = useCallback(async (selectedNodeId) => {
		if (!scene) return;
		const client = OccWorkerClient.getInstance();
		const group = new THREE.Group();
		group.userData.isHelper = true;
		const otherElements = elements.filter((el) => el.nodeId !== selectedNodeId && !isFlat(el.brep));
		for (const el of otherElements) {
			let result;
			try {
				result = await client.send({
					type: "edgeAnalysis",
					payload: {
						brepJson: el.brep.toJSON(),
						position: toVec3(el.position),
						occBrep: el.occBrep,
						rotation: el.rotation ? toEulerJSON(el.rotation) : void 0,
						allEdges: true
					}
				});
			} catch {
				continue;
			}
			const edgeDataArr = result.edges;
			if (!edgeDataArr) continue;
			for (const edge of edgeDataArr) {
				if (edge.segments.length !== 6) continue;
				const start = new THREE.Vector3(edge.segments[0], edge.segments[1], edge.segments[2]);
				const end = new THREE.Vector3(edge.segments[3], edge.segments[4], edge.segments[5]);
				if (start.distanceTo(end) < 1e-6) continue;
				const geom = new LineGeometry();
				geom.setPositions([
					start.x,
					start.y,
					start.z,
					end.x,
					end.y,
					end.z
				]);
				const line = new Line2(geom, new LineMaterial({
					color: REVOLVE.bodyEdgeAxis,
					linewidth: FILLET.edgeWidth,
					depthTest: false,
					resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
				}));
				line.computeLineDistances();
				line.renderOrder = 999;
				line.userData.bodyEdgeStart = start;
				line.userData.bodyEdgeEnd = end;
				line.userData.axisSourceType = "bodyEdge";
				group.add(line);
			}
		}
		if (group.children.length > 0) {
			scene.add(group);
			bodyEdgeOverlayRef.current = group;
			forceSceneUpdate();
		}
	}, [
		elements,
		scene,
		forceSceneUpdate,
		bodyEdgeOverlayRef
	]);
	/** Remove all axis-source overlay groups (profile edges, sketch lines, body edges). */
	const removeEdgeOverlay = useCallback(() => {
		const disposeGroup = (group) => {
			group.children.forEach((child) => {
				if (child instanceof Line2) {
					child.geometry.dispose();
					child.material.dispose();
				} else if (child instanceof THREE.LineSegments || child instanceof THREE.Line) {
					child.geometry.dispose();
					if (child.material instanceof THREE.Material) child.material.dispose();
				}
			});
			group.parent?.remove(group);
		};
		if (edgeOverlayGroupRef.current) {
			disposeGroup(edgeOverlayGroupRef.current);
			edgeOverlayGroupRef.current = null;
		}
		if (sketchLineOverlayRef.current) {
			disposeGroup(sketchLineOverlayRef.current);
			sketchLineOverlayRef.current = null;
		}
		if (bodyEdgeOverlayRef.current) {
			disposeGroup(bodyEdgeOverlayRef.current);
			bodyEdgeOverlayRef.current = null;
		}
		edgeSegmentsRef.current = [];
		hoveredEdgeRef.current = null;
	}, [
		edgeOverlayGroupRef,
		sketchLineOverlayRef,
		bodyEdgeOverlayRef,
		edgeSegmentsRef,
		hoveredEdgeRef
	]);
	/** Remove the extended axis visualization line. */
	const removeAxisLine = useCallback(() => {
		if (axisLineRef.current) {
			axisLineRef.current.geometry.dispose();
			if (axisLineRef.current.material instanceof THREE.Material) axisLineRef.current.material.dispose();
			axisLineRef.current.parent?.remove(axisLineRef.current);
			axisLineRef.current = null;
		}
	}, [axisLineRef]);
	/** Show extended axis visualization (5-unit overshoot on both ends). */
	const showAxisLine = useCallback((start, end) => {
		removeAxisLine();
		const dir = end.clone().sub(start).normalize();
		const extendedStart = start.clone().sub(dir.clone().multiplyScalar(5));
		const extendedEnd = end.clone().add(dir.clone().multiplyScalar(5));
		const geom = new THREE.BufferGeometry().setFromPoints([extendedStart, extendedEnd]);
		const mat = new THREE.LineBasicMaterial({
			color: REVOLVE.axisLine,
			linewidth: 2,
			depthTest: false
		});
		const line = new THREE.Line(geom, mat);
		line.renderOrder = 999;
		line.userData.isHelper = true;
		if (scene) scene.add(line);
		axisLineRef.current = line;
		forceSceneUpdate();
	}, [
		scene,
		forceSceneUpdate,
		removeAxisLine,
		axisLineRef
	]);
	return {
		buildEdgeOverlay,
		buildSketchLineOverlays,
		buildOtherBodyEdgeOverlays,
		removeEdgeOverlay,
		showAxisLine,
		removeAxisLine,
		flipAxis: useCallback(() => {
			if (state.phase !== "SET_ANGLE" || !state.axisEdgeStart || !state.axisEdgeEnd) return;
			const newStart = state.axisEdgeEnd.clone();
			const newEnd = state.axisEdgeStart.clone();
			showAxisLine(newStart, newEnd);
			setState((prev) => ({
				...prev,
				axisEdgeStart: newStart,
				axisEdgeEnd: newEnd
			}));
		}, [
			state.phase,
			state.axisEdgeStart,
			state.axisEdgeEnd,
			showAxisLine,
			setState
		]),
		selectOriginAxis: useCallback((axis) => {
			if (state.phase !== "SELECT_AXIS") return;
			const start = new THREE.Vector3(0, 0, 0);
			const end = new THREE.Vector3(axis === "X" ? 1 : 0, axis === "Y" ? 1 : 0, axis === "Z" ? 1 : 0);
			removeEdgeOverlay();
			showAxisLine(start, end);
			setState((prev) => ({
				...prev,
				phase: "SET_ANGLE",
				axisEdgeStart: start,
				axisEdgeEnd: end,
				showDimensionInput: true,
				dimensionInputPosition: {
					x: window.innerWidth / 2,
					y: window.innerHeight / 2
				}
			}));
		}, [
			state.phase,
			removeEdgeOverlay,
			showAxisLine,
			setState
		]),
		pickExtraOverlayAxis: useCallback((raycaster) => {
			if (sketchLineOverlayRef.current && sketchLineOverlayRef.current.children.length > 0) {
				const hits = raycaster.intersectObjects(sketchLineOverlayRef.current.children, false);
				if (hits.length > 0) {
					const obj = hits[0].object;
					const start = obj.userData.sketchLineStart;
					const end = obj.userData.sketchLineEnd;
					if (start && end) return {
						start: start.clone(),
						end: end.clone()
					};
				}
			}
			if (bodyEdgeOverlayRef.current && bodyEdgeOverlayRef.current.children.length > 0) {
				const hits = raycaster.intersectObjects(bodyEdgeOverlayRef.current.children, false);
				if (hits.length > 0) {
					const obj = hits[0].object;
					const start = obj.userData.bodyEdgeStart;
					const end = obj.userData.bodyEdgeEnd;
					if (start && end) return {
						start: start.clone(),
						end: end.clone()
					};
				}
			}
			return null;
		}, [sketchLineOverlayRef, bodyEdgeOverlayRef]),
		resetExtraOverlayHover: useCallback(() => {
			if (sketchLineOverlayRef.current) sketchLineOverlayRef.current.children.forEach((child) => {
				if (child instanceof Line2) child.material.color.set(REVOLVE.sketchLineAxis);
			});
			if (bodyEdgeOverlayRef.current) bodyEdgeOverlayRef.current.children.forEach((child) => {
				if (child instanceof Line2) child.material.color.set(REVOLVE.bodyEdgeAxis);
			});
		}, [sketchLineOverlayRef, bodyEdgeOverlayRef]),
		selectProfileById: useCallback((nodeId) => {
			const obj = getObject(nodeId);
			if (obj) obj.traverse((child) => {
				if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) child.material.color.set(SELECTION.selected);
			});
			setState((prev) => ({
				...prev,
				phase: "SELECT_AXIS",
				selectedElement: nodeId
			}));
			buildEdgeOverlay(nodeId);
			buildSketchLineOverlays();
			buildOtherBodyEdgeOverlays(nodeId);
		}, [
			getObject,
			buildEdgeOverlay,
			buildSketchLineOverlays,
			buildOtherBodyEdgeOverlays,
			setState
		])
	};
}
//#endregion
//#region src/hooks/revolve/hooks/useRevolveInputHandlers.ts
function useRevolveInputHandlers({ stateBag, axisSelection, apply, cleanup }) {
	const { elements, getObject } = useCadCore();
	const { renderer, forceSceneUpdate, navToolActiveRef, selectOtherRef } = useCadVisualizer();
	const { raycasterFromEvent } = useRaycastToObjects();
	const { state, setState, hoveredElementRef, edgeSegmentsRef, edgeOverlayGroupRef, hoveredEdgeRef, sketchLineOverlayRef, bodyEdgeOverlayRef, hoverPreviewRef, menuOpenRef, resetHover, applyHoverPreview } = stateBag;
	const { selectProfileById, removeEdgeOverlay, showAxisLine, pickExtraOverlayAxis, resetExtraOverlayHover } = axisSelection;
	const { performRevolve } = apply;
	const profileFilter = useCallback((el) => isFlat(el.brep), []);
	const isApplyingRef = useMemo(() => ({ current: state.isApplying }), [state.isApplying]);
	const holdRefs = useModeInputHoldRefs();
	/**
	* Factory handles SELECT_PROFILE only. SELECT_AXIS picks are inline below
	*, they have no SelectOther, no drag threshold, and overlay-priority
	* raycasting that doesn't fit the factory shape.
	*/
	const factoryHandlers = useMemo(() => {
		return createModeInputHandlers({
			pickTargets: (raycaster) => {
				if (state.phase !== "SELECT_PROFILE") return null;
				const picks = collectPicksUnderCursor(raycaster, elements, getObject, {
					filter: profileFilter,
					nameFor: makeBodyOrProfileLabel(elements)
				});
				if (picks.length === 0) return null;
				return {
					picks,
					resolved: picks[0].elementId
				};
			},
			hoverTargets: (raycaster) => {
				if (state.phase !== "SELECT_PROFILE") return null;
				const meshes = collectPickableMeshes(elements.filter((el) => isFlat(el.brep)), getObject);
				const intersects = raycaster.intersectObjects(meshes, false);
				if (intersects.length === 0) return null;
				let parentObj = intersects[0].object;
				while (parentObj.parent && !parentObj.userData.nodeId) parentObj = parentObj.parent;
				return parentObj.userData.nodeId ?? null;
			},
			onPickStart: (initial) => {
				selectProfileById(initial);
			},
			onPickFromMenu: (item, initial) => {
				menuOpenRef.current = false;
				hoverPreviewRef.current = null;
				if (item.elementId === initial) return;
				tintMeshes(getObject, initial, BODY.default);
				removeEdgeOverlay();
				selectProfileById(item.elementId);
			},
			onHover: (nodeId) => {
				resetHover();
				if (nodeId) {
					hoveredElementRef.current = nodeId;
					tintMeshes(getObject, nodeId, BODY.hover);
					if (renderer) renderer.domElement.style.cursor = "pointer";
				} else if (renderer) renderer.domElement.style.cursor = "default";
				forceSceneUpdate();
				return null;
			},
			onMenuOpen: (initial) => {
				menuOpenRef.current = true;
				tintMeshes(getObject, initial, BODY.default);
			},
			onMenuCancel: (initial) => {
				menuOpenRef.current = false;
				hoverPreviewRef.current = null;
				tintMeshes(getObject, initial, SELECTION.selected);
			},
			onCancel: cleanup,
			onCommit: () => {
				if (state.phase === "SET_ANGLE") performRevolve();
			},
			enableContextMenu: state.phase === "SELECT_PROFILE"
		}, {
			raycasterFromEvent,
			selectOtherRef,
			navToolActiveRef,
			isApplyingRef
		}, holdRefs);
	}, [
		elements,
		getObject,
		profileFilter,
		selectProfileById,
		removeEdgeOverlay,
		resetHover,
		applyHoverPreview,
		forceSceneUpdate,
		raycasterFromEvent,
		selectOtherRef,
		navToolActiveRef,
		isApplyingRef,
		holdRefs,
		state.phase,
		renderer,
		hoveredElementRef,
		hoverPreviewRef,
		menuOpenRef,
		cleanup,
		performRevolve
	]);
	const axisModeHandleMouseDown = useCallback((event) => {
		if (state.phase !== "SELECT_AXIS") return;
		if (event.button !== 0 || event.altKey || navToolActiveRef.current || state.isApplying) return;
		const raycaster = raycasterFromEvent(event);
		if (!raycaster) return;
		if (edgeOverlayGroupRef.current && edgeSegmentsRef.current.length > 0) {
			const intersects = raycaster.intersectObjects(edgeOverlayGroupRef.current.children, false);
			if (intersects.length > 0) {
				const edgeIndex = intersects[0].object.userData.edgeIndex;
				const edgeData = edgeSegmentsRef.current.find((e) => e.edgeIndex === edgeIndex);
				if (!edgeData || edgeData.segments.length < 6) return;
				const start = new THREE.Vector3(edgeData.segments[0], edgeData.segments[1], edgeData.segments[2]);
				const lastIdx = edgeData.segments.length - 3;
				const end = new THREE.Vector3(edgeData.segments[lastIdx], edgeData.segments[lastIdx + 1], edgeData.segments[lastIdx + 2]);
				removeEdgeOverlay();
				showAxisLine(start, end);
				setState((prev) => ({
					...prev,
					phase: "SET_ANGLE",
					axisEdgeStart: start,
					axisEdgeEnd: end,
					showDimensionInput: true,
					dimensionInputPosition: {
						x: event.clientX,
						y: event.clientY
					}
				}));
				return;
			}
		}
		const extraHit = pickExtraOverlayAxis(raycaster);
		if (extraHit) {
			removeEdgeOverlay();
			showAxisLine(extraHit.start, extraHit.end);
			setState((prev) => ({
				...prev,
				phase: "SET_ANGLE",
				axisEdgeStart: extraHit.start,
				axisEdgeEnd: extraHit.end,
				showDimensionInput: true,
				dimensionInputPosition: {
					x: event.clientX,
					y: event.clientY
				}
			}));
		}
	}, [
		navToolActiveRef,
		raycasterFromEvent,
		state.phase,
		state.isApplying,
		edgeOverlayGroupRef,
		edgeSegmentsRef,
		removeEdgeOverlay,
		showAxisLine,
		pickExtraOverlayAxis,
		setState
	]);
	const axisModeHandleMouseMove = useCallback((event) => {
		if (state.phase !== "SELECT_AXIS") return;
		if (state.isApplying) return;
		const raycaster = raycasterFromEvent(event);
		if (!raycaster) return;
		if (edgeOverlayGroupRef.current) edgeOverlayGroupRef.current.children.forEach((child) => {
			if (child instanceof Line2) child.material.color.set(REVOLVE.axisLine);
		});
		resetExtraOverlayHover();
		let foundHover = false;
		if (edgeOverlayGroupRef.current) {
			const intersects = raycaster.intersectObjects(edgeOverlayGroupRef.current.children, false);
			if (intersects.length > 0) {
				const edgeIndex = intersects[0].object.userData.edgeIndex;
				hoveredEdgeRef.current = edgeIndex;
				edgeOverlayGroupRef.current.children.forEach((child) => {
					if (child instanceof Line2 && child.userData.edgeIndex === edgeIndex) child.material.color.set(REVOLVE.axisHover);
				});
				foundHover = true;
			}
		}
		if (!foundHover && sketchLineOverlayRef.current && sketchLineOverlayRef.current.children.length > 0) {
			const hits = raycaster.intersectObjects(sketchLineOverlayRef.current.children, false);
			if (hits.length > 0) {
				hits[0].object.material.color.set(REVOLVE.axisHover);
				foundHover = true;
			}
		}
		if (!foundHover && bodyEdgeOverlayRef.current && bodyEdgeOverlayRef.current.children.length > 0) {
			const hits = raycaster.intersectObjects(bodyEdgeOverlayRef.current.children, false);
			if (hits.length > 0) {
				hits[0].object.material.color.set(REVOLVE.axisHover);
				foundHover = true;
			}
		}
		if (foundHover) {
			if (renderer) renderer.domElement.style.cursor = "pointer";
		} else {
			hoveredEdgeRef.current = null;
			if (renderer) renderer.domElement.style.cursor = "default";
		}
		forceSceneUpdate();
	}, [
		raycasterFromEvent,
		state.phase,
		state.isApplying,
		edgeOverlayGroupRef,
		sketchLineOverlayRef,
		bodyEdgeOverlayRef,
		hoveredEdgeRef,
		resetExtraOverlayHover,
		forceSceneUpdate,
		renderer
	]);
	return useMemo(() => ({
		handleMouseDown: (event) => {
			factoryHandlers.handleMouseDown(event);
			axisModeHandleMouseDown(event);
		},
		handleMouseMove: (event) => {
			factoryHandlers.handleMouseMove(event);
			axisModeHandleMouseMove(event);
		},
		handleMouseUp: factoryHandlers.handleMouseUp,
		handleContextMenu: factoryHandlers.handleContextMenu,
		handleKeyDown: factoryHandlers.handleKeyDown
	}), [
		factoryHandlers,
		axisModeHandleMouseDown,
		axisModeHandleMouseMove
	]);
}
//#endregion
//#region src/hooks/revolve/hooks/useRevolveState.ts
function useRevolveState() {
	const { getObject } = useCadCore();
	const [state, setState] = useState({
		phase: "SELECT_PROFILE",
		selectedElement: null,
		axisEdgeStart: null,
		axisEdgeEnd: null,
		angle: 360,
		angle2: 360,
		direction: "one",
		isApplying: false,
		showDimensionInput: false,
		dimensionInputPosition: {
			x: 0,
			y: 0
		}
	});
	const hoveredElementRef = useRef(null);
	const edgeSegmentsRef = useRef([]);
	const edgeOverlayGroupRef = useRef(null);
	const hoveredEdgeRef = useRef(null);
	const axisLineRef = useRef(null);
	const sketchLineOverlayRef = useRef(null);
	const bodyEdgeOverlayRef = useRef(null);
	const holdStartRef = useRef(null);
	const menuOpenRef = useRef(false);
	const { hoverPreviewRef, applyHoverPreview, restoreHoverPreview } = useHoverPreview();
	return {
		state,
		setState,
		hoveredElementRef,
		edgeSegmentsRef,
		edgeOverlayGroupRef,
		hoveredEdgeRef,
		axisLineRef,
		sketchLineOverlayRef,
		bodyEdgeOverlayRef,
		holdStartRef,
		hoverPreviewRef,
		menuOpenRef,
		setAngle: useCallback((angle) => setState((prev) => ({
			...prev,
			angle
		})), []),
		setAngle2: useCallback((angle2) => setState((prev) => ({
			...prev,
			angle2
		})), []),
		setDirection: useCallback((direction) => setState((prev) => ({
			...prev,
			direction
		})), []),
		resetHover: useCallback(() => {
			if (hoveredElementRef.current) {
				const obj = getObject(hoveredElementRef.current);
				if (obj) obj.traverse((child) => {
					if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) {
						if (hoveredElementRef.current !== state.selectedElement) child.material.color.set(BODY.default);
					}
				});
				hoveredElementRef.current = null;
			}
		}, [getObject, state.selectedElement]),
		applyHoverPreview,
		restoreHoverPreview
	};
}
//#endregion
//#region src/hooks/useRevolveMode.ts
/**
* Hook for Fusion 360-style revolve mode.
* State machine: SELECT_PROFILE → SELECT_AXIS → SET_ANGLE
*
* Composed of four sub-hooks living under `hooks/revolve/`:
*   - useRevolveState         (state + refs + simple setters + hover + select-other preview)
*   - useRevolveAxisSelection (overlay builders + axis line + flipAxis + selectOriginAxis + selectProfileById)
*   - useRevolveApply         (performRevolve)
*   - useRevolveInputHandlers (mouse + keyboard handlers)
*/
function useRevolveMode() {
	const { getObject, elements, sketches } = useCadCore();
	const { renderer, forceSceneUpdate } = useCadVisualizer();
	const stateBag = useRevolveState();
	const axisSelection = useRevolveAxisSelection({ stateBag });
	const apply = useRevolveApply({
		stateBag,
		axisSelection
	});
	const { state, setState, resetHover } = stateBag;
	const { removeEdgeOverlay, removeAxisLine } = axisSelection;
	useEffect(() => {
		removeEdgeOverlay();
		removeAxisLine();
		setState((prev) => prev.phase === "SELECT_PROFILE" ? prev : {
			...prev,
			phase: "SELECT_PROFILE",
			selectedElement: null,
			axisEdgeStart: null,
			axisEdgeEnd: null,
			showDimensionInput: false
		});
	}, [
		elements,
		sketches,
		removeEdgeOverlay,
		removeAxisLine,
		setState
	]);
	const cleanup = useCallback(() => {
		resetHover();
		removeEdgeOverlay();
		removeAxisLine();
		if (state.selectedElement) {
			const obj = getObject(state.selectedElement);
			if (obj) obj.traverse((child) => {
				if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) child.material.color.set(BODY.default);
			});
		}
		if (renderer) renderer.domElement.style.cursor = "default";
		setState({
			phase: "SELECT_PROFILE",
			selectedElement: null,
			axisEdgeStart: null,
			axisEdgeEnd: null,
			angle: 360,
			angle2: 360,
			direction: "one",
			isApplying: false,
			showDimensionInput: false,
			dimensionInputPosition: {
				x: 0,
				y: 0
			}
		});
		forceSceneUpdate();
	}, [
		resetHover,
		removeEdgeOverlay,
		removeAxisLine,
		state.selectedElement,
		getObject,
		renderer,
		forceSceneUpdate,
		setState
	]);
	const cleanupRef = useRef(cleanup);
	cleanupRef.current = cleanup;
	useEffect(() => () => cleanupRef.current(), []);
	const handlers = useRevolveInputHandlers({
		stateBag,
		axisSelection,
		apply,
		cleanup
	});
	return {
		phase: state.phase,
		selectedElement: state.selectedElement,
		isApplying: state.isApplying,
		angle: state.angle,
		angle2: state.angle2,
		direction: state.direction,
		showDimensionInput: state.showDimensionInput,
		dimensionInputPosition: state.dimensionInputPosition,
		setAngle: stateBag.setAngle,
		setAngle2: stateBag.setAngle2,
		setDirection: stateBag.setDirection,
		flipAxis: axisSelection.flipAxis,
		handleMouseDown: handlers.handleMouseDown,
		handleMouseMove: handlers.handleMouseMove,
		handleMouseUp: handlers.handleMouseUp,
		handleContextMenu: handlers.handleContextMenu,
		handleKeyDown: handlers.handleKeyDown,
		performRevolve: apply.performRevolve,
		selectOriginAxis: axisSelection.selectOriginAxis,
		cleanup
	};
}
//#endregion
//#region src/hooks/sketch/sketch-helpers.ts
/**
* Configuration constants for sketch mode behavior.
* All distance values are in world units.
*/
const SKETCH_CONFIG = {
	/** Distance in world units to snap to existing points when drawing */
	SNAP_DISTANCE: .3,
	/** Visual size of point primitives in world units */
	POINT_SIZE: .08,
	/** Maximum number of primitives that can be selected at once */
	MAX_SELECTION: 2,
	/** Distance in world units to snap to inference points (endpoints, midpoints, etc.) */
	INFERENCE_SNAP_DISTANCE: .4,
	/** Tolerance in radians for detecting horizontal/vertical alignment (~3.4 degrees) */
	ALIGNMENT_TOLERANCE: .06,
	/** Time threshold in milliseconds for detecting double-click */
	DOUBLE_CLICK_THRESHOLD: 300,
	/** Screen-space pixel radius for point selection (proximity check) */
	POINT_HIT_RADIUS_PX: 12,
	/** Extra pixels of tolerance for Line2 screen-space raycast */
	LINE_HIT_THRESHOLD: 8,
	/** Pixel threshold before a constraint glyph mousedown becomes a drag */
	GLYPH_DRAG_THRESHOLD_PX: 5
};
/** Colors for sketch visualization (hex values), Fusion 360 style */
const COLORS = {
	/** Under-constrained geometry (needs more constraints) */
	underconstrained: SKETCH.underconstrained,
	/** Fully constrained geometry */
	constrained: SKETCH.constrained,
	/** Over-constrained geometry (conflicting constraints) */
	overconstrained: SKETCH.overconstrained,
	/** Preview while drawing */
	preview: SKETCH.preview,
	/** Point primitives (unconstrained) */
	point: SKETCH.point,
	/** Selected elements */
	selected: SKETCH.selected,
	/** Selected line primitives */
	selectedLine: SKETCH.selectedLine,
	/** Selected point primitives */
	selectedPoint: SKETCH.selectedPoint
};
/** Distance from a 2D point to a line segment (p1→p2) */
function pointToLineDistance(pt, p1, p2) {
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	const len2 = dx * dx + dy * dy;
	if (len2 < 1e-10) return Math.hypot(pt.x - p1.x, pt.y - p1.y);
	const t = Math.max(0, Math.min(1, ((pt.x - p1.x) * dx + (pt.y - p1.y) * dy) / len2));
	const projX = p1.x + t * dx;
	const projY = p1.y + t * dy;
	return Math.hypot(pt.x - projX, pt.y - projY);
}
/** Helper: create a Line2 with LineMaterial for consistent thin-line rendering */
function createLine2FromPoints(positions, color, linewidth, dashed = false) {
	const geometry = new LineGeometry();
	geometry.setPositions(positions);
	const material = new LineMaterial({
		color,
		linewidth,
		dashed,
		...dashed ? {
			dashSize: .15,
			gapSize: .1
		} : {},
		resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
	});
	if (dashed) material.defines.USE_DASH = "";
	const line = new Line2(geometry, material);
	line.computeLineDistances();
	return line;
}
/** Get the number of screen pixels that correspond to one sketch-space unit */
function getPixelsPerUnit(camera, renderer) {
	const p1 = new THREE.Vector3(0, 0, 0).project(camera);
	const p2 = new THREE.Vector3(1, 0, 0).project(camera);
	const rect = renderer.domElement.getBoundingClientRect();
	return Math.abs(p2.x - p1.x) * .5 * rect.width;
}
/** Convert a pixel radius to sketch-space units based on current camera zoom */
function screenPxToSketchUnits(camera, renderer, px) {
	const pixelsPerUnit = getPixelsPerUnit(camera, renderer);
	return pixelsPerUnit > 0 ? px / pixelsPerUnit : .5;
}
/** Calculate adaptive segment count for circle/arc rendering based on screen size.
*  Targets ~4 screen pixels per segment for visually smooth curves. */
function getAdaptiveSegments(camera, renderer, radius, sweepAngle = Math.PI * 2) {
	if (!camera || !renderer) return sweepAngle >= Math.PI * 2 ? 64 : 32;
	const arcLengthPx = radius * getPixelsPerUnit(camera, renderer) * Math.abs(sweepAngle);
	const raw = Math.ceil(arcLengthPx / 4);
	return Math.max(8, Math.min(256, raw));
}
/** Helper: create a constraint glyph sprite at a given position */
function createConstraintGlyph(text, position, selected = false) {
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const fontSize = 32;
	const padding = 16;
	const measureCtx = document.createElement("canvas").getContext("2d");
	measureCtx.font = `bold ${fontSize}px sans-serif`;
	const textWidth = measureCtx.measureText(text).width;
	const height = 64;
	const width = Math.max(height, Math.ceil(textWidth + padding * 2));
	const canvas = document.createElement("canvas");
	canvas.width = width * dpr;
	canvas.height = height * dpr;
	const ctx = canvas.getContext("2d");
	ctx.scale(dpr, dpr);
	const radius = height / 2;
	ctx.beginPath();
	if (width <= height) ctx.arc(width / 2, height / 2, radius - 4, 0, Math.PI * 2);
	else {
		const r = radius - 4;
		ctx.moveTo(r + 4, 4);
		ctx.lineTo(width - r - 4, 4);
		ctx.arc(width - r - 4, height / 2, r, -Math.PI / 2, Math.PI / 2);
		ctx.lineTo(r + 4, height - 4);
		ctx.arc(r + 4, height / 2, r, Math.PI / 2, -Math.PI / 2);
		ctx.closePath();
	}
	ctx.fillStyle = selected ? SKETCH.constraintFillSelectedCss : SKETCH.constraintFillCss;
	ctx.fill();
	if (selected) {
		ctx.strokeStyle = SKETCH.constraintStrokeSelectedCss;
		ctx.lineWidth = 3;
		ctx.stroke();
	}
	ctx.fillStyle = selected ? SKETCH.constraintTextSelectedCss : SKETCH.constraintTextCss;
	ctx.font = `bold ${fontSize}px sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(text, width / 2, height / 2 + 1);
	const texture = new THREE.CanvasTexture(canvas);
	texture.minFilter = THREE.LinearFilter;
	texture.generateMipmaps = false;
	const material = new THREE.SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false
	});
	const sprite = new THREE.Sprite(material);
	sprite.position.copy(position);
	const baseScale = .35;
	const aspect = width / height;
	sprite.scale.set(baseScale * aspect, baseScale, baseScale);
	sprite.renderOrder = 1001;
	return sprite;
}
/** Convert a 3D world point to 2D sketch coordinates (inverse of sketchTo3D). */
function worldToSketch2D(point3D, plane) {
	const delta = point3D.clone().sub(plane.origin);
	return new THREE.Vector3(delta.dot(plane.xAxis), delta.dot(plane.yAxis), 0);
}
/** Snap a sketch-space point to the grid when grid snap is enabled. */
function snapToGrid(point, gridSpacing, snapEnabled) {
	if (snapEnabled) {
		point.x = Math.round(point.x / gridSpacing) * gridSpacing;
		point.y = Math.round(point.y / gridSpacing) * gridSpacing;
	}
	return point;
}
/** Build a Line2 preview between two sketch-space points. */
function createLinePreview(start, end, sketchTo3D) {
	const s3d = sketchTo3D(start.x, start.y, SKETCH_PLANE_Z_LIFT_MM);
	const e3d = sketchTo3D(end.x, end.y, SKETCH_PLANE_Z_LIFT_MM);
	return createLine2FromPoints([
		s3d.x,
		s3d.y,
		s3d.z,
		e3d.x,
		e3d.y,
		e3d.z
	], COLORS.preview, 1.5);
}
/** Build a Line2 rectangle preview from two opposite corners. */
function createRectanglePreview(corner1, corner2, sketchTo3D) {
	const bl = sketchTo3D(corner1.x, corner1.y, SKETCH_PLANE_Z_LIFT_MM);
	const br = sketchTo3D(corner2.x, corner1.y, SKETCH_PLANE_Z_LIFT_MM);
	const tr = sketchTo3D(corner2.x, corner2.y, SKETCH_PLANE_Z_LIFT_MM);
	const tl = sketchTo3D(corner1.x, corner2.y, SKETCH_PLANE_Z_LIFT_MM);
	return createLine2FromPoints([
		bl.x,
		bl.y,
		bl.z,
		br.x,
		br.y,
		br.z,
		tr.x,
		tr.y,
		tr.z,
		tl.x,
		tl.y,
		tl.z,
		bl.x,
		bl.y,
		bl.z
	], COLORS.preview, 1.5);
}
/** Build a Line2 circle preview at the given center / radius (sketch-space). */
function createCirclePreview(center, radius, sketchTo3D, camera, renderer) {
	const segments = getAdaptiveSegments(camera, renderer, radius);
	const positions = [];
	for (let i = 0; i <= segments; i++) {
		const angle = i / segments * Math.PI * 2;
		const p3d = sketchTo3D(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius, SKETCH_PLANE_Z_LIFT_MM);
		positions.push(p3d.x, p3d.y, p3d.z);
	}
	return createLine2FromPoints(positions, COLORS.preview, 1.5);
}
//#endregion
//#region src/hooks/sketch/hooks/useSketchPlaneSelection.ts
function useSketchPlaneSelection({ cameraAnimFrameRef, sketchHidGroundPlaneRef, originalProjectionRef, projectionTypeRef, dimSceneBodies, orientCameraToPlane, createSketchGrid, cleanupSketchGrid, raycastToObjects }) {
	const { startSketch, elements, getObject } = useCadCore();
	const { scene, camera, showGroundPlane, toggleGroundPlane, setCameraRotationEnabled, setDrawingPlane, setProjectionType, controlsRef, requestRender } = useCadVisualizer();
	const [isSelectingPlane, setIsSelectingPlane] = useState(false);
	const [hoveredPlane, setHoveredPlane] = useState(null);
	const selectionPlanesRef = useRef(null);
	const originalCameraPositionRef = useRef(null);
	const originalCameraUpRef = useRef(null);
	const originalControlsTargetRef = useRef(null);
	const faceHighlightRef = useRef(null);
	const planeOffsetRef = useRef(0);
	const offsetPreviewRef = useRef(null);
	const positionCameraForPlaneSelection = useCallback(() => {
		if (!camera) return;
		if (cameraAnimFrameRef.current !== null) {
			cancelAnimationFrame(cameraAnimFrameRef.current);
			cameraAnimFrameRef.current = null;
		}
		const controls = controlsRef.current;
		originalCameraPositionRef.current = camera.position.clone();
		originalCameraUpRef.current = camera.up.clone();
		if (controls) originalControlsTargetRef.current = controls.target.clone();
		const distance = 12;
		const duration = 400;
		const targetPosition = new THREE.Vector3(distance * .7, distance * .5, distance * .7);
		const targetUp = new THREE.Vector3(0, 1, 0);
		const targetLookAt = new THREE.Vector3(0, 0, 0);
		const startPosition = camera.position.clone();
		const startUp = camera.up.clone();
		const startControlsTarget = controls ? controls.target.clone() : new THREE.Vector3();
		const startTime = Date.now();
		const animateCamera = () => {
			const elapsed = Date.now() - startTime;
			const t = Math.min(elapsed / duration, 1);
			const eased = 1 - Math.pow(1 - t, 3);
			camera.position.lerpVectors(startPosition, targetPosition, eased);
			camera.up.lerpVectors(startUp, targetUp, eased);
			if (controls) {
				controls.target.lerpVectors(startControlsTarget, targetLookAt, eased);
				controls.update();
			}
			camera.lookAt(targetLookAt);
			if (t < 1) cameraAnimFrameRef.current = requestAnimationFrame(animateCamera);
			else cameraAnimFrameRef.current = null;
		};
		cameraAnimFrameRef.current = requestAnimationFrame(animateCamera);
	}, [
		camera,
		controlsRef,
		cameraAnimFrameRef
	]);
	const createSelectionPlanes = useCallback(() => {
		if (!scene) return;
		if (selectionPlanesRef.current) {
			scene.remove(selectionPlanesRef.current);
			const trackedMaterials = selectionPlanesRef.current.userData.materials;
			const trackedGeometries = selectionPlanesRef.current.userData.geometries;
			trackedMaterials?.forEach((m) => m.dispose());
			trackedGeometries?.forEach((g) => g.dispose());
			selectionPlanesRef.current.traverse((obj) => {
				if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
					obj.geometry?.dispose();
					if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
					else obj.material?.dispose();
				}
			});
		}
		const planesGroup = new THREE.Group();
		const materials = [];
		const geometries = [];
		planesGroup.userData.isSelectionPlanes = true;
		const planeSize = 4;
		const halfSize = planeSize / 2;
		const xyGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
		geometries.push(xyGeometry);
		const xyMaterial = new THREE.MeshBasicMaterial({
			color: SKETCH_PLANE.xy,
			transparent: true,
			opacity: .5,
			side: THREE.DoubleSide,
			depthWrite: false
		});
		materials.push(xyMaterial);
		const xyPlane = new THREE.Mesh(xyGeometry, xyMaterial);
		xyPlane.position.set(halfSize, halfSize, 0);
		xyPlane.userData.planeType = "XY";
		xyPlane.userData.baseColor = SKETCH_PLANE.xy;
		xyPlane.userData.baseOpacity = .5;
		planesGroup.add(xyPlane);
		const xzGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
		geometries.push(xzGeometry);
		const xzMaterial = new THREE.MeshBasicMaterial({
			color: SKETCH_PLANE.xz,
			transparent: true,
			opacity: .5,
			side: THREE.DoubleSide,
			depthWrite: false
		});
		materials.push(xzMaterial);
		const xzPlane = new THREE.Mesh(xzGeometry, xzMaterial);
		xzPlane.rotation.x = -Math.PI / 2;
		xzPlane.position.set(halfSize, 0, halfSize);
		xzPlane.userData.planeType = "XZ";
		xzPlane.userData.baseColor = SKETCH_PLANE.xz;
		xzPlane.userData.baseOpacity = .5;
		planesGroup.add(xzPlane);
		const yzGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
		geometries.push(yzGeometry);
		const yzMaterial = new THREE.MeshBasicMaterial({
			color: SKETCH_PLANE.yz,
			transparent: true,
			opacity: .5,
			side: THREE.DoubleSide,
			depthWrite: false
		});
		materials.push(yzMaterial);
		const yzPlane = new THREE.Mesh(yzGeometry, yzMaterial);
		yzPlane.rotation.y = Math.PI / 2;
		yzPlane.position.set(0, halfSize, halfSize);
		yzPlane.userData.planeType = "YZ";
		yzPlane.userData.baseColor = SKETCH_PLANE.yz;
		yzPlane.userData.baseOpacity = .5;
		planesGroup.add(yzPlane);
		const edgeMaterial = new THREE.LineBasicMaterial({
			color: SKETCH_PLANE.edge,
			linewidth: 2
		});
		materials.push(edgeMaterial);
		const xEdgeGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(planeSize, 0, 0)]);
		geometries.push(xEdgeGeometry);
		const xEdgeMaterial = new THREE.LineBasicMaterial({ color: SKETCH_PLANE.xAxis });
		materials.push(xEdgeMaterial);
		const xEdge = new THREE.Line(xEdgeGeometry, xEdgeMaterial);
		planesGroup.add(xEdge);
		const yEdgeGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, planeSize, 0)]);
		geometries.push(yEdgeGeometry);
		const yEdgeMaterial = new THREE.LineBasicMaterial({ color: SKETCH_PLANE.yAxis });
		materials.push(yEdgeMaterial);
		const yEdge = new THREE.Line(yEdgeGeometry, yEdgeMaterial);
		planesGroup.add(yEdge);
		const zEdgeGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, planeSize)]);
		geometries.push(zEdgeGeometry);
		const zEdgeMaterial = new THREE.LineBasicMaterial({ color: SKETCH_PLANE.zAxis });
		materials.push(zEdgeMaterial);
		const zEdge = new THREE.Line(zEdgeGeometry, zEdgeMaterial);
		planesGroup.add(zEdge);
		const topEdge1Geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, planeSize, 0), new THREE.Vector3(planeSize, planeSize, 0)]);
		geometries.push(topEdge1Geometry);
		const topEdge1 = new THREE.Line(topEdge1Geometry, edgeMaterial);
		planesGroup.add(topEdge1);
		const topEdge2Geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, planeSize, 0), new THREE.Vector3(0, planeSize, planeSize)]);
		geometries.push(topEdge2Geometry);
		const topEdge2 = new THREE.Line(topEdge2Geometry, edgeMaterial);
		planesGroup.add(topEdge2);
		const rightEdge1Geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(planeSize, 0, 0), new THREE.Vector3(planeSize, planeSize, 0)]);
		geometries.push(rightEdge1Geometry);
		const rightEdge1 = new THREE.Line(rightEdge1Geometry, edgeMaterial);
		planesGroup.add(rightEdge1);
		const frontEdge1Geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, planeSize), new THREE.Vector3(planeSize, 0, planeSize)]);
		geometries.push(frontEdge1Geometry);
		const frontEdge1 = new THREE.Line(frontEdge1Geometry, edgeMaterial);
		planesGroup.add(frontEdge1);
		const frontEdge2Geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, planeSize), new THREE.Vector3(0, planeSize, planeSize)]);
		geometries.push(frontEdge2Geometry);
		const frontEdge2 = new THREE.Line(frontEdge2Geometry, edgeMaterial);
		planesGroup.add(frontEdge2);
		const originGeometry = new THREE.SphereGeometry(.15, 16, 16);
		geometries.push(originGeometry);
		const originMaterial = new THREE.MeshBasicMaterial({ color: SKETCH_PLANE.origin });
		materials.push(originMaterial);
		const originSphere = new THREE.Mesh(originGeometry, originMaterial);
		planesGroup.add(originSphere);
		planesGroup.userData.materials = materials;
		planesGroup.userData.geometries = geometries;
		scene.add(planesGroup);
		selectionPlanesRef.current = planesGroup;
		requestRender();
	}, [scene, requestRender]);
	const removeSelectionPlanes = useCallback(() => {
		if (!scene || !selectionPlanesRef.current) return;
		scene.remove(selectionPlanesRef.current);
		selectionPlanesRef.current.traverse((obj) => {
			if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
				obj.geometry?.dispose();
				if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
				else obj.material?.dispose();
			}
		});
		selectionPlanesRef.current = null;
		requestRender();
	}, [scene, requestRender]);
	const removeOffsetPreview = useCallback(() => {
		if (!scene || !offsetPreviewRef.current) return;
		scene.remove(offsetPreviewRef.current);
		offsetPreviewRef.current.traverse((obj) => {
			if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
				obj.geometry?.dispose();
				if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
				else obj.material?.dispose();
			}
		});
		offsetPreviewRef.current = null;
		if (selectionPlanesRef.current) selectionPlanesRef.current.children.forEach((child) => {
			if (child instanceof THREE.Mesh && child.userData.planeType) {
				const mat = child.material;
				mat.opacity = .5;
				child.userData.baseOpacity = .5;
			}
		});
		requestRender();
	}, [scene, requestRender]);
	const updateOffsetPreview = useCallback((offset) => {
		if (!scene || !selectionPlanesRef.current) return;
		removeOffsetPreview();
		if (offset === 0) {
			if (selectionPlanesRef.current) selectionPlanesRef.current.children.forEach((child) => {
				if (child instanceof THREE.Mesh && child.userData.planeType) {
					const mat = child.material;
					mat.opacity = .5;
					child.userData.baseOpacity = .5;
				}
			});
			return;
		}
		const planeSize = 4;
		const halfSize = planeSize / 2;
		const previewGroup = new THREE.Group();
		previewGroup.userData.isOffsetPreview = true;
		const planeConfigs = [
			{
				color: SKETCH_PLANE.xy,
				position: new THREE.Vector3(halfSize, halfSize, offset),
				planeType: "XY"
			},
			{
				color: SKETCH_PLANE.xz,
				position: new THREE.Vector3(halfSize, offset, halfSize),
				rotation: new THREE.Euler(-Math.PI / 2, 0, 0),
				planeType: "XZ"
			},
			{
				color: SKETCH_PLANE.yz,
				position: new THREE.Vector3(offset, halfSize, halfSize),
				rotation: new THREE.Euler(0, Math.PI / 2, 0),
				planeType: "YZ"
			}
		];
		for (const cfg of planeConfigs) {
			const geo = new THREE.PlaneGeometry(planeSize, planeSize);
			const mat = new THREE.MeshBasicMaterial({
				color: cfg.color,
				transparent: true,
				opacity: .5,
				side: THREE.DoubleSide,
				depthWrite: false
			});
			const mesh = new THREE.Mesh(geo, mat);
			mesh.position.copy(cfg.position);
			if (cfg.rotation) mesh.rotation.copy(cfg.rotation);
			mesh.userData.planeType = cfg.planeType;
			mesh.userData.baseColor = cfg.color;
			mesh.userData.baseOpacity = .5;
			previewGroup.add(mesh);
		}
		if (selectionPlanesRef.current) selectionPlanesRef.current.children.forEach((child) => {
			if (child instanceof THREE.Mesh && child.userData.planeType) {
				const mat = child.material;
				mat.opacity = .15;
				child.userData.baseOpacity = .15;
			}
		});
		const dashMat = new THREE.LineDashedMaterial({
			color: SKETCH_PLANE.edge,
			dashSize: .15,
			gapSize: .1,
			transparent: true,
			opacity: .4
		});
		const xyCorners = [
			[0, 0],
			[planeSize, 0],
			[planeSize, planeSize],
			[0, planeSize]
		];
		for (const [cx, cy] of xyCorners) {
			const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(cx, cy, 0), new THREE.Vector3(cx, cy, offset)]);
			const line = new THREE.Line(geo, dashMat);
			line.computeLineDistances();
			previewGroup.add(line);
		}
		const xzCorners = [
			[0, 0],
			[planeSize, 0],
			[planeSize, planeSize],
			[0, planeSize]
		];
		for (const [cx, cz] of xzCorners) {
			const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(cx, 0, cz), new THREE.Vector3(cx, offset, cz)]);
			const line = new THREE.Line(geo, dashMat);
			line.computeLineDistances();
			previewGroup.add(line);
		}
		const yzCorners = [
			[0, 0],
			[planeSize, 0],
			[planeSize, planeSize],
			[0, planeSize]
		];
		for (const [cy, cz] of yzCorners) {
			const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, cy, cz), new THREE.Vector3(offset, cy, cz)]);
			const line = new THREE.Line(geo, dashMat);
			line.computeLineDistances();
			previewGroup.add(line);
		}
		scene.add(previewGroup);
		offsetPreviewRef.current = previewGroup;
		requestRender();
	}, [
		scene,
		removeOffsetPreview,
		requestRender
	]);
	const collectBodyMeshes = useCallback(() => {
		const meshes = [];
		for (const el of elements) {
			const obj = getObject(el.nodeId);
			if (!obj) continue;
			obj.traverse((child) => {
				if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper && !child.userData.isSketchPrimitive) meshes.push(child);
			});
		}
		return meshes;
	}, [elements, getObject]);
	const getFaceWorldNormal = useCallback((intersection) => {
		if (!intersection.face) return null;
		const normal = intersection.face.normal.clone();
		const mesh = intersection.object;
		const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
		normal.applyMatrix3(normalMatrix).normalize();
		return normal;
	}, []);
	const cleanupFaceHighlight = useCallback(() => {
		if (faceHighlightRef.current && scene) {
			scene.remove(faceHighlightRef.current);
			faceHighlightRef.current.geometry.dispose();
			faceHighlightRef.current.material.dispose();
			faceHighlightRef.current = null;
			requestRender();
		}
	}, [scene, requestRender]);
	const handlePlaneSelectionMouseMove = useCallback((event) => {
		if (!isSelectingPlane) return;
		cleanupFaceHighlight();
		const targetGroup = offsetPreviewRef.current || selectionPlanesRef.current;
		if (targetGroup) {
			const planes = targetGroup.children.filter((child) => child instanceof THREE.Mesh && child.userData.planeType);
			const intersects = raycastToObjects(event, planes, false);
			planes.forEach((plane) => {
				const material = plane.material;
				material.color.setHex(plane.userData.baseColor);
				material.opacity = plane.userData.baseOpacity || .5;
			});
			if (intersects.length > 0) {
				const hitPlane = intersects[0].object;
				const material = hitPlane.material;
				material.color.setHex(SKETCH_PLANE.hover);
				material.opacity = .8;
				setHoveredPlane(hitPlane.userData.planeType);
				requestRender();
				return;
			}
		}
		const bodyMeshes = collectBodyMeshes();
		if (bodyMeshes.length > 0) {
			const bodyIntersects = raycastToObjects(event, bodyMeshes, false);
			if (bodyIntersects.length > 0) {
				const hit = bodyIntersects[0];
				const worldNormal = getFaceWorldNormal(hit);
				if (worldNormal && scene) {
					const highlightGeom = new THREE.CircleGeometry(2, 32);
					const highlightMat = new THREE.MeshBasicMaterial({
						color: SKETCH.selected,
						transparent: true,
						opacity: .4,
						side: THREE.DoubleSide,
						depthTest: false
					});
					const highlight = new THREE.Mesh(highlightGeom, highlightMat);
					highlight.position.copy(hit.point).addScaledVector(worldNormal, SKETCH_PLANE_Z_LIFT_MM);
					const quat = new THREE.Quaternion();
					quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);
					highlight.quaternion.copy(quat);
					highlight.renderOrder = 1e3;
					scene.add(highlight);
					faceHighlightRef.current = highlight;
					setHoveredPlane("face");
					requestRender();
					return;
				}
			}
		}
		setHoveredPlane(null);
		requestRender();
	}, [
		isSelectingPlane,
		raycastToObjects,
		collectBodyMeshes,
		getFaceWorldNormal,
		cleanupFaceHighlight,
		scene,
		requestRender
	]);
	const setPlaneOffset = useCallback((v) => {
		planeOffsetRef.current = v;
		updateOffsetPreview(v);
	}, [updateOffsetPreview]);
	const enterPlaneSelectionMode = useCallback(() => {
		cleanupSketchGrid();
		setIsSelectingPlane(true);
		setHoveredPlane(null);
		createSelectionPlanes();
		positionCameraForPlaneSelection();
	}, [
		cleanupSketchGrid,
		createSelectionPlanes,
		positionCameraForPlaneSelection
	]);
	const cancelPlaneSelection = useCallback(() => {
		setIsSelectingPlane(false);
		setHoveredPlane(null);
		removeOffsetPreview();
		removeSelectionPlanes();
		cleanupFaceHighlight();
		if (camera && originalCameraPositionRef.current && originalCameraUpRef.current) {
			camera.position.copy(originalCameraPositionRef.current);
			camera.up.copy(originalCameraUpRef.current);
			const controls = controlsRef.current;
			if (controls && originalControlsTargetRef.current) {
				controls.target.copy(originalControlsTargetRef.current);
				controls.update();
			}
			camera.lookAt(originalControlsTargetRef.current ?? new THREE.Vector3(0, 0, 0));
			originalCameraPositionRef.current = null;
			originalCameraUpRef.current = null;
			originalControlsTargetRef.current = null;
		}
	}, [
		camera,
		controlsRef,
		removeOffsetPreview,
		removeSelectionPlanes,
		cleanupFaceHighlight
	]);
	const selectPlaneAndStartSketch = useCallback((planeOrType, offset) => {
		const plane = typeof planeOrType === "string" ? createSketchPlane(planeOrType) : planeOrType;
		if (offset && typeof planeOrType === "string") {
			plane.origin.addScaledVector(plane.normal, offset);
			plane.type = "offset";
			plane.offset = offset;
		}
		setIsSelectingPlane(false);
		setHoveredPlane(null);
		removeOffsetPreview();
		removeSelectionPlanes();
		if (showGroundPlane) {
			toggleGroundPlane();
			sketchHidGroundPlaneRef.current = true;
		}
		setCameraRotationEnabled(false);
		originalProjectionRef.current = projectionTypeRef.current;
		dimSceneBodies();
		const planeConstant = -plane.normal.dot(plane.origin);
		setDrawingPlane(plane.normal, planeConstant);
		orientCameraToPlane(plane, () => {
			if (projectionTypeRef.current !== "orthographic") setProjectionType("orthographic");
		});
		createSketchGrid(plane, plane.type === "face" ? 10 : void 0);
		startSketch(plane);
	}, [
		removeOffsetPreview,
		removeSelectionPlanes,
		orientCameraToPlane,
		createSketchGrid,
		startSketch,
		showGroundPlane,
		toggleGroundPlane,
		setCameraRotationEnabled,
		dimSceneBodies,
		setDrawingPlane,
		setProjectionType,
		sketchHidGroundPlaneRef,
		originalProjectionRef,
		projectionTypeRef
	]);
	return {
		isSelectingPlane,
		hoveredPlane,
		handlePlaneSelectionMouseMove,
		handlePlaneSelectionClick: useCallback((event) => {
			if (!isSelectingPlane) return;
			cleanupFaceHighlight();
			const targetGroup = offsetPreviewRef.current || selectionPlanesRef.current;
			if (targetGroup) {
				const intersects = raycastToObjects(event, targetGroup.children.filter((child) => child instanceof THREE.Mesh && child.userData.planeType), false);
				if (intersects.length > 0) {
					const planeType = intersects[0].object.userData.planeType;
					selectPlaneAndStartSketch(planeType, planeOffsetRef.current || void 0);
					return;
				}
			}
			const bodyMeshes = collectBodyMeshes();
			if (bodyMeshes.length > 0) {
				const bodyIntersects = raycastToObjects(event, bodyMeshes, false);
				if (bodyIntersects.length > 0) {
					const hit = bodyIntersects[0];
					const worldNormal = getFaceWorldNormal(hit);
					if (worldNormal) {
						let elementNodeId;
						let parent = hit.object.parent;
						while (parent) {
							if (parent.userData?.nodeId) {
								elementNodeId = nodeId(parent.userData.nodeId);
								break;
							}
							parent = parent.parent;
						}
						const axes = [
							new THREE.Vector3(1, 0, 0),
							new THREE.Vector3(-1, 0, 0),
							new THREE.Vector3(0, 1, 0),
							new THREE.Vector3(0, -1, 0),
							new THREE.Vector3(0, 0, 1),
							new THREE.Vector3(0, 0, -1)
						];
						for (const axis of axes) if (worldNormal.angleTo(axis) < .1) {
							worldNormal.copy(axis);
							break;
						}
						selectPlaneAndStartSketch(createSketchPlaneFromNormal(worldNormal, hit.point, elementNodeId), planeOffsetRef.current || void 0);
					}
				}
			}
		}, [
			isSelectingPlane,
			raycastToObjects,
			collectBodyMeshes,
			getFaceWorldNormal,
			cleanupFaceHighlight,
			selectPlaneAndStartSketch
		]),
		setPlaneOffset,
		enterPlaneSelectionMode,
		cancelPlaneSelection,
		selectPlaneAndStartSketch
	};
}
//#endregion
//#region src/hooks/sketch/hooks/useSketchSceneVisuals.ts
/**
* Sketch scene-visual lifecycle:
*   - body dimming (3D bodies fade while in sketch mode, restored on exit)
*   - sketch grid rendering (rebuilt on gridSpacing change)
*   - camera orient-to-plane animation (used by both plane picker AND sketch resume)
*   - editingSketchId resume effect (replays sketch-entry sequence when user
*     reopens an existing sketch via the feature tree)
*/
function useSketchSceneVisuals({ activeSketch, editingSketchId, cameraAnimFrameRef, sketchHidGroundPlaneRef, originalProjectionRef, projectionTypeRef }) {
	const { elements, getObject } = useCadCore();
	const { scene, camera, gridSpacing, controlsRef, showGroundPlane, toggleGroundPlane, setCameraRotationEnabled, setDrawingPlane, setProjectionType, requestRender } = useCadVisualizer();
	const dimmedMaterialsRef = useRef(/* @__PURE__ */ new Map());
	const sketchGridRef = useRef(null);
	/** Dim all existing 3D bodies so the sketch stands out. */
	const dimSceneBodies = useCallback(() => {
		dimmedMaterialsRef.current.clear();
		elements.forEach((el) => {
			const obj = getObject(el.nodeId);
			if (!obj) return;
			obj.traverse((child) => {
				if (child instanceof THREE.Mesh && !child.userData.isSketchPrimitive && !child.userData.isEdgeOverlay) {
					const mat = child.material;
					const key = child.uuid;
					dimmedMaterialsRef.current.set(key, {
						color: mat.color.getHex(),
						opacity: mat.opacity,
						transparent: mat.transparent
					});
					mat.transparent = true;
					mat.opacity = BODY.dimmedOpacity;
					mat.color.set(BODY.dimmedColor);
					mat.needsUpdate = true;
				}
				if (child instanceof LineSegments2 && child.userData.isEdgeOverlay) {
					const mat = child.material;
					const key = child.uuid;
					dimmedMaterialsRef.current.set(key, {
						color: mat.color.getHex(),
						opacity: mat.opacity ?? 1,
						transparent: mat.transparent ?? false
					});
					mat.transparent = true;
					mat.opacity = BODY.dimmedOpacity;
					mat.needsUpdate = true;
				}
			});
		});
		requestRender();
	}, [
		elements,
		getObject,
		requestRender
	]);
	/** Restore all dimmed bodies to their original appearance. */
	const restoreSceneBodies = useCallback(() => {
		elements.forEach((el) => {
			const obj = getObject(el.nodeId);
			if (!obj) return;
			obj.traverse((child) => {
				const key = child.uuid;
				const saved = dimmedMaterialsRef.current.get(key);
				if (!saved) return;
				if (child instanceof THREE.Mesh) {
					const mat = child.material;
					mat.color.set(saved.color);
					mat.opacity = saved.opacity;
					mat.transparent = saved.transparent;
					mat.needsUpdate = true;
				}
				if (child instanceof LineSegments2 && child.userData.isEdgeOverlay) {
					const mat = child.material;
					mat.color.set(saved.color);
					mat.opacity = saved.opacity;
					mat.transparent = saved.transparent;
					mat.needsUpdate = true;
				}
			});
		});
		dimmedMaterialsRef.current.clear();
		requestRender();
	}, [
		elements,
		getObject,
		requestRender
	]);
	const createSketchGrid = useCallback((plane, gridSizeOverride) => {
		if (!scene) return;
		if (sketchGridRef.current) {
			scene.remove(sketchGridRef.current);
			sketchGridRef.current.traverse((obj) => {
				if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
					obj.geometry?.dispose();
					if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
					else obj.material?.dispose();
				}
			});
			sketchGridRef.current = null;
		}
		const gridGroup = new THREE.Group();
		gridGroup.userData.isSketchGrid = true;
		const gridSize = gridSizeOverride ?? 20;
		const halfSize = gridSize / 2;
		const step = gridSpacing;
		const majorStep = Math.max(step * 5, 1);
		const majorMaterial = new THREE.LineBasicMaterial({ color: SKETCH_PLANE.gridMajor });
		const minorMaterial = new THREE.LineBasicMaterial({ color: SKETCH_PLANE.gridMinor });
		const majorPoints = [];
		const minorPoints = [];
		for (let i = -halfSize; i <= halfSize; i += step) {
			const pts = Math.abs(i - Math.round(i / majorStep) * majorStep) < 1e-6 ? majorPoints : minorPoints;
			pts.push(plane.origin.clone().addScaledVector(plane.xAxis, i).addScaledVector(plane.yAxis, -halfSize));
			pts.push(plane.origin.clone().addScaledVector(plane.xAxis, i).addScaledVector(plane.yAxis, halfSize));
			pts.push(plane.origin.clone().addScaledVector(plane.yAxis, i).addScaledVector(plane.xAxis, -halfSize));
			pts.push(plane.origin.clone().addScaledVector(plane.yAxis, i).addScaledVector(plane.xAxis, halfSize));
		}
		if (minorPoints.length > 0) {
			const minorGeometry = new THREE.BufferGeometry().setFromPoints(minorPoints);
			gridGroup.add(new THREE.LineSegments(minorGeometry, minorMaterial));
		}
		if (majorPoints.length > 0) {
			const majorGeometry = new THREE.BufferGeometry().setFromPoints(majorPoints);
			gridGroup.add(new THREE.LineSegments(majorGeometry, majorMaterial));
		}
		const axisLength = Math.min(gridSize / 10, 1);
		const xAxisPoints = [plane.origin.clone(), plane.origin.clone().addScaledVector(plane.xAxis, axisLength)];
		const yAxisPoints = [plane.origin.clone(), plane.origin.clone().addScaledVector(plane.yAxis, axisLength)];
		const xAxisGeom = new THREE.BufferGeometry().setFromPoints(xAxisPoints);
		const yAxisGeom = new THREE.BufferGeometry().setFromPoints(yAxisPoints);
		const xAxisLine = new THREE.Line(xAxisGeom, new THREE.LineBasicMaterial({
			color: SKETCH_PLANE.xAxis,
			linewidth: 2,
			depthTest: false
		}));
		const yAxisLine = new THREE.Line(yAxisGeom, new THREE.LineBasicMaterial({
			color: SKETCH_PLANE.yAxis,
			linewidth: 2,
			depthTest: false
		}));
		xAxisLine.renderOrder = 999;
		yAxisLine.renderOrder = 999;
		gridGroup.add(xAxisLine);
		gridGroup.add(yAxisLine);
		scene.add(gridGroup);
		sketchGridRef.current = gridGroup;
		requestRender();
	}, [
		scene,
		gridSpacing,
		requestRender
	]);
	const cleanupSketchGrid = useCallback(() => {
		if (!scene || !sketchGridRef.current) return;
		scene.remove(sketchGridRef.current);
		sketchGridRef.current.traverse((obj) => {
			if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
				obj.geometry?.dispose();
				if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
				else obj.material?.dispose();
			}
		});
		sketchGridRef.current = null;
		requestRender();
	}, [scene, requestRender]);
	useEffect(() => {
		if (activeSketch && sketchGridRef.current) createSketchGrid(activeSketch.plane);
	}, [gridSpacing]);
	/** Orient camera perpendicular to a sketch plane (animated). */
	const orientCameraToPlane = useCallback((plane, onComplete) => {
		if (!camera) return;
		if (cameraAnimFrameRef.current !== null) {
			cancelAnimationFrame(cameraAnimFrameRef.current);
			cameraAnimFrameRef.current = null;
		}
		const controls = controlsRef.current;
		const distance = 15;
		const duration = 500;
		const targetPosition = plane.origin.clone().addScaledVector(plane.normal, distance);
		const targetUp = plane.yAxis.clone();
		const lookAtTarget = plane.origin.clone();
		const startPosition = camera.position.clone();
		const startUp = camera.up.clone();
		const startControlsTarget = controls ? controls.target.clone() : new THREE.Vector3();
		const startTime = Date.now();
		const animateCamera = () => {
			const elapsed = Date.now() - startTime;
			const t = Math.min(elapsed / duration, 1);
			const eased = 1 - Math.pow(1 - t, 3);
			camera.position.lerpVectors(startPosition, targetPosition, eased);
			camera.up.lerpVectors(startUp, targetUp, eased);
			if (controls) {
				controls.target.lerpVectors(startControlsTarget, lookAtTarget, eased);
				controls.update();
			}
			camera.lookAt(lookAtTarget);
			if (t < 1) cameraAnimFrameRef.current = requestAnimationFrame(animateCamera);
			else {
				cameraAnimFrameRef.current = null;
				onComplete?.();
			}
		};
		cameraAnimFrameRef.current = requestAnimationFrame(animateCamera);
	}, [
		camera,
		controlsRef,
		cameraAnimFrameRef
	]);
	useEffect(() => {
		if (!editingSketchId || !activeSketch) return;
		const plane = {
			...activeSketch.plane,
			origin: new THREE.Vector3(activeSketch.plane.origin.x, activeSketch.plane.origin.y, activeSketch.plane.origin.z),
			normal: new THREE.Vector3(activeSketch.plane.normal.x, activeSketch.plane.normal.y, activeSketch.plane.normal.z),
			xAxis: new THREE.Vector3(activeSketch.plane.xAxis.x, activeSketch.plane.xAxis.y, activeSketch.plane.xAxis.z),
			yAxis: new THREE.Vector3(activeSketch.plane.yAxis.x, activeSketch.plane.yAxis.y, activeSketch.plane.yAxis.z)
		};
		if (showGroundPlane) {
			toggleGroundPlane();
			sketchHidGroundPlaneRef.current = true;
		}
		setCameraRotationEnabled(false);
		originalProjectionRef.current = projectionTypeRef.current;
		dimSceneBodies();
		const planeConstant = -plane.normal.dot(plane.origin);
		setDrawingPlane(plane.normal, planeConstant);
		orientCameraToPlane(plane, () => {
			if (projectionTypeRef.current !== "orthographic") setProjectionType("orthographic");
		});
		createSketchGrid(plane, plane.type === "face" ? 10 : void 0);
	}, [editingSketchId]);
	return {
		dimSceneBodies,
		restoreSceneBodies,
		createSketchGrid,
		cleanupSketchGrid,
		orientCameraToPlane
	};
}
//#endregion
//#region src/hooks/sketch/hooks/useSketchInferenceRender.ts
/**
* Renders inference snap glyphs and alignment guidelines into the scene.
* Owns the THREE objects' lifecycle (creation + disposal); driven by the
* `useSketchInference` hook's findInferencePoints / findGuidelines output.
*/
function useSketchInferenceRender({ sketchTo3DRef }) {
	const { scene, requestRender } = useCadVisualizer();
	const inferenceObjectsRef = useRef([]);
	const guidelineObjectsRef = useRef([]);
	const cleanupInferenceObjects = useCallback(() => {
		if (scene) {
			inferenceObjectsRef.current.forEach((obj) => {
				scene.remove(obj);
				if (obj instanceof THREE.Mesh || obj instanceof Line2 || obj instanceof THREE.Line) {
					obj.geometry.dispose();
					obj.material.dispose();
				} else if (obj instanceof THREE.Sprite) {
					obj.material.map?.dispose();
					obj.material.dispose();
				}
			});
			inferenceObjectsRef.current = [];
			guidelineObjectsRef.current.forEach((obj) => {
				scene.remove(obj);
				if (obj instanceof Line2 || obj instanceof THREE.Line) {
					obj.geometry.dispose();
					obj.material.dispose();
				}
			});
			guidelineObjectsRef.current = [];
			requestRender();
		}
	}, [scene, requestRender]);
	return {
		cleanupInferenceObjects,
		renderInferencePoint: useCallback((inferencePoint) => {
			if (!scene) return;
			cleanupInferenceObjects();
			let geometry;
			let color;
			switch (inferencePoint.type) {
				case "endpoint":
					geometry = new THREE.BoxGeometry(.09, .09, .02);
					color = INFERENCE.endpoint;
					break;
				case "midpoint": {
					const triangleShape = new THREE.Shape();
					triangleShape.moveTo(0, .06);
					triangleShape.lineTo(-.05, -.03);
					triangleShape.lineTo(.05, -.03);
					triangleShape.lineTo(0, .06);
					geometry = new THREE.ShapeGeometry(triangleShape);
					color = INFERENCE.midpoint;
					break;
				}
				case "center":
					geometry = new THREE.CircleGeometry(.05, 16);
					color = INFERENCE.center;
					break;
				case "quadrant": {
					const diamondShape = new THREE.Shape();
					diamondShape.moveTo(0, .05);
					diamondShape.lineTo(-.05, 0);
					diamondShape.lineTo(0, -.05);
					diamondShape.lineTo(.05, 0);
					diamondShape.lineTo(0, .05);
					geometry = new THREE.ShapeGeometry(diamondShape);
					color = INFERENCE.quadrant;
					break;
				}
				case "intersection":
					geometry = new THREE.BoxGeometry(.07, .07, .02);
					color = INFERENCE.intersection;
					break;
				default:
					geometry = new THREE.CircleGeometry(.04, 8);
					color = INFERENCE.default;
			}
			const material = new THREE.MeshBasicMaterial({
				color,
				transparent: true,
				opacity: .9,
				depthTest: false
			});
			const mesh = new THREE.Mesh(geometry, material);
			const pos3D = sketchTo3DRef.current(inferencePoint.position.x, inferencePoint.position.y, .2);
			mesh.position.copy(pos3D);
			mesh.renderOrder = 1e3;
			scene.add(mesh);
			inferenceObjectsRef.current.push(mesh);
			requestRender();
		}, [
			scene,
			cleanupInferenceObjects,
			sketchTo3DRef,
			requestRender
		]),
		renderGuidelines: useCallback((currentGuidelines) => {
			if (!scene) return;
			guidelineObjectsRef.current.forEach((obj) => {
				scene.remove(obj);
				if (obj instanceof Line2 || obj instanceof THREE.Line) {
					obj.geometry.dispose();
					obj.material.dispose();
				}
			});
			guidelineObjectsRef.current = [];
			for (const guideline of currentGuidelines) {
				const s3d = sketchTo3DRef.current(guideline.start.x, guideline.start.y, SKETCH_PLANE_Z_LIFT_MM);
				const e3d = sketchTo3DRef.current(guideline.end.x, guideline.end.y, SKETCH_PLANE_Z_LIFT_MM);
				const line = createLine2FromPoints([
					s3d.x,
					s3d.y,
					s3d.z,
					e3d.x,
					e3d.y,
					e3d.z
				], guideline.color, 1, true);
				line.material.transparent = true;
				line.material.opacity = .6;
				line.material.depthTest = false;
				line.renderOrder = 999;
				scene.add(line);
				guidelineObjectsRef.current.push(line);
			}
			requestRender();
		}, [
			scene,
			sketchTo3DRef,
			requestRender
		])
	};
}
//#endregion
//#region src/hooks/sketch/hooks/useSketchTrimExtend.ts
function useSketchTrimExtend({ generateId, sketchTo3DRef }) {
	const { activeSketch, addPrimitive, updatePrimitive, removePrimitive, addConstraintAndSolve, solveSketch, pushSketchUndo } = useCadCore();
	const { scene, camera, renderer, requestRender } = useCadVisualizer();
	const trimHighlightRef = useRef(null);
	const trimHoveredPrimRef = useRef(null);
	const extendHoveredRef = useRef(null);
	const cleanupTrimHighlight = useCallback(() => {
		if (trimHighlightRef.current && scene) {
			scene.remove(trimHighlightRef.current);
			if (trimHighlightRef.current instanceof THREE.Group) trimHighlightRef.current.traverse((child) => {
				if (child instanceof Line2 || child instanceof THREE.Line || child instanceof THREE.Mesh) {
					child.geometry.dispose();
					child.material.dispose();
				}
			});
			else if (trimHighlightRef.current instanceof Line2 || trimHighlightRef.current instanceof THREE.Line) {
				trimHighlightRef.current.geometry.dispose();
				trimHighlightRef.current.material.dispose();
			}
			trimHighlightRef.current = null;
			requestRender();
		}
		trimHoveredPrimRef.current = null;
		extendHoveredRef.current = null;
	}, [scene, requestRender]);
	const applyTrimConstraints = useCallback(async (newPoints, intersections) => {
		if (!activeSketch || newPoints.length === 0) return;
		for (const pt of newPoints) {
			let bestIx = null;
			let bestDist = POINT_COINCIDENCE_TOL_MM;
			for (const ix of intersections) {
				const d = Math.hypot(pt.x - ix.point.x, pt.y - ix.point.y);
				if (d < bestDist) {
					bestDist = d;
					bestIx = ix;
				}
			}
			if (!bestIx) continue;
			const otherPrim = activeSketch.primitives.find((p) => p.id === bestIx.otherPrimId);
			if (!otherPrim) continue;
			let constraintType = null;
			if (isSketchLine(otherPrim)) constraintType = "pointOnLine";
			else if (isSketchCircle(otherPrim) || isSketchArc(otherPrim)) constraintType = "pointOnCircle";
			if (!constraintType) continue;
			await addConstraintAndSolve({
				id: generateId("const"),
				type: constraintType,
				primitiveIds: [pt.id, bestIx.otherPrimId],
				driving: true
			});
		}
	}, [
		activeSketch,
		generateId,
		addConstraintAndSolve
	]);
	return {
		cleanupTrimHighlight,
		handleTrimMode: useCallback(async (event, point) => {
			if (!activeSketch) return;
			const pt2d = worldToSketch2D(point, activeSketch.plane);
			if (!pt2d) return;
			const cursorPoint = {
				x: pt2d.x,
				y: pt2d.y
			};
			if (event.type === "mousemove") {
				cleanupTrimHighlight();
				let bestPrimId = null;
				let bestDist = camera && renderer ? screenPxToSketchUnits(camera, renderer, 15) : .5;
				for (const prim of activeSketch.primitives) {
					if (isSketchPoint(prim)) continue;
					if (prim.origin) continue;
					let dist = Infinity;
					if (isSketchLine(prim)) {
						const p1 = findSketchPoint(activeSketch.primitives, prim.p1Id);
						const p2 = findSketchPoint(activeSketch.primitives, prim.p2Id);
						if (p1 && p2) dist = pointToLineDistance(cursorPoint, {
							x: p1.x,
							y: p1.y
						}, {
							x: p2.x,
							y: p2.y
						});
					} else if (isSketchCircle(prim)) {
						const center = findSketchPoint(activeSketch.primitives, prim.centerId);
						if (center) dist = Math.abs(Math.hypot(cursorPoint.x - center.x, cursorPoint.y - center.y) - prim.radius);
					} else if (isSketchArc(prim)) {
						const center = findSketchPoint(activeSketch.primitives, prim.centerId);
						if (center) {
							const radialDist = Math.abs(Math.hypot(cursorPoint.x - center.x, cursorPoint.y - center.y) - prim.radius);
							const arcAngles = getArcAngles(activeSketch, prim);
							if (arcAngles) {
								if (isAngleInArcRange(Math.atan2(cursorPoint.y - center.y, cursorPoint.x - center.x), arcAngles.startAngle, arcAngles.endAngle)) dist = radialDist;
							}
						}
					}
					if (dist < bestDist) {
						bestDist = dist;
						bestPrimId = prim.id;
					}
				}
				if (bestPrimId) {
					const intersections = findAllIntersections(activeSketch, bestPrimId);
					const segment = identifyTrimSegment(activeSketch, bestPrimId, intersections, cursorPoint);
					if (segment && intersections.length > 0) {
						trimHoveredPrimRef.current = {
							primId: bestPrimId,
							startParam: segment.startParam,
							endParam: segment.endParam
						};
						const prim = activeSketch.primitives.find((p) => p.id === bestPrimId);
						if (prim && sketchTo3DRef.current) {
							let positions = null;
							if (isSketchLine(prim)) {
								const p1 = findSketchPoint(activeSketch.primitives, prim.p1Id);
								const p2 = findSketchPoint(activeSketch.primitives, prim.p2Id);
								if (p1 && p2) {
									const s = segment.startParam;
									const e = segment.endParam;
									const sx = p1.x + s * (p2.x - p1.x);
									const sy = p1.y + s * (p2.y - p1.y);
									const ex = p1.x + e * (p2.x - p1.x);
									const ey = p1.y + e * (p2.y - p1.y);
									const start3d = sketchTo3DRef.current(sx, sy, SKETCH_PREVIEW_Z_LIFT_MM);
									const end3d = sketchTo3DRef.current(ex, ey, SKETCH_PREVIEW_Z_LIFT_MM);
									positions = [
										start3d.x,
										start3d.y,
										start3d.z,
										end3d.x,
										end3d.y,
										end3d.z
									];
								}
							} else if (isSketchCircle(prim) || isSketchArc(prim)) {
								const center = findSketchPoint(activeSketch.primitives, prim.centerId);
								if (center) {
									const radius = prim.radius;
									const sAngle = segment.startParam;
									let angleDiff = segment.endParam - sAngle;
									if (angleDiff <= 0) angleDiff += Math.PI * 2;
									const segCount = getAdaptiveSegments(camera, renderer, radius, angleDiff);
									positions = [];
									for (let i = 0; i <= segCount; i++) {
										const t = i / segCount;
										const angle = sAngle + angleDiff * t;
										const lx = center.x + Math.cos(angle) * radius;
										const ly = center.y + Math.sin(angle) * radius;
										const pt3d = sketchTo3DRef.current(lx, ly, SKETCH_PREVIEW_Z_LIFT_MM);
										positions.push(pt3d.x, pt3d.y, pt3d.z);
									}
								}
							}
							if (positions && positions.length >= 6) {
								const line = createLine2FromPoints(positions, SKETCH.trimHighlight, 3);
								line.renderOrder = 1e3;
								if (scene) {
									scene.add(line);
									requestRender();
								}
								trimHighlightRef.current = line;
							}
						}
					}
				}
			} else if (event.type === "mousedown") {
				if (!trimHoveredPrimRef.current) return;
				const { primId, startParam, endParam } = trimHoveredPrimRef.current;
				cleanupTrimHighlight();
				pushSketchUndo();
				const prim = activeSketch.primitives.find((p) => p.id === primId);
				if (!prim) return;
				const findExistingPoint = (x, y, tolerance = POINT_COINCIDENCE_TOL_MM) => {
					for (const p of activeSketch.primitives) if (isSketchPoint(p) && Math.hypot(p.x - x, p.y - y) < tolerance) return p;
					return null;
				};
				const intersections = findAllIntersections(activeSketch, primId);
				if (isSketchLine(prim)) {
					const p1 = findSketchPoint(activeSketch.primitives, prim.p1Id);
					const p2 = findSketchPoint(activeSketch.primitives, prim.p2Id);
					if (!p1 || !p2) return;
					const isStartSegment = startParam < SKETCH_PARAM_ENDPOINT_TOL;
					const isEndSegment = endParam > 1 - SKETCH_PARAM_ENDPOINT_TOL;
					if (isStartSegment && isEndSegment) removePrimitive(primId);
					else if (isStartSegment) {
						const newX = p1.x + endParam * (p2.x - p1.x);
						const newY = p1.y + endParam * (p2.y - p1.y);
						removePrimitive(primId);
						const existing = findExistingPoint(newX, newY);
						const newPtId = existing ? existing.id : generateId("point");
						if (!existing) addPrimitive({
							id: newPtId,
							type: "point",
							x: newX,
							y: newY
						});
						addPrimitive({
							id: generateId("line"),
							type: "line",
							p1Id: newPtId,
							p2Id: prim.p2Id,
							construction: prim.construction
						});
						await applyTrimConstraints(existing ? [] : [{
							id: newPtId,
							x: newX,
							y: newY
						}], intersections);
					} else if (isEndSegment) {
						const newX = p1.x + startParam * (p2.x - p1.x);
						const newY = p1.y + startParam * (p2.y - p1.y);
						removePrimitive(primId);
						const existing = findExistingPoint(newX, newY);
						const newPtId = existing ? existing.id : generateId("point");
						if (!existing) addPrimitive({
							id: newPtId,
							type: "point",
							x: newX,
							y: newY
						});
						addPrimitive({
							id: generateId("line"),
							type: "line",
							p1Id: prim.p1Id,
							p2Id: newPtId,
							construction: prim.construction
						});
						await applyTrimConstraints(existing ? [] : [{
							id: newPtId,
							x: newX,
							y: newY
						}], intersections);
					} else {
						const splitPts = [];
						const newlyCreatedPts = [];
						const sortedParams = intersections.map((ix) => ix.tSource).filter((t) => t > 1e-4 && t < .9999).sort((a, b) => a - b);
						for (const t of sortedParams) {
							const x = p1.x + t * (p2.x - p1.x);
							const y = p1.y + t * (p2.y - p1.y);
							const existing = findExistingPoint(x, y);
							const id = existing ? existing.id : generateId("point");
							splitPts.push({
								id,
								x,
								y
							});
							if (!existing) newlyCreatedPts.push({
								id,
								x,
								y
							});
						}
						removePrimitive(primId);
						for (const pt of newlyCreatedPts) addPrimitive({
							id: pt.id,
							type: "point",
							x: pt.x,
							y: pt.y
						});
						const orderedPtIds = [
							prim.p1Id,
							...splitPts.map((p) => p.id),
							prim.p2Id
						];
						const newLines = [];
						for (let i = 0; i < orderedPtIds.length - 1; i++) newLines.push({
							id: generateId("line"),
							p1Id: orderedPtIds[i],
							p2Id: orderedPtIds[i + 1]
						});
						const boundaries = [
							0,
							...sortedParams,
							1
						];
						let skipIdx = -1;
						for (let i = 0; i < boundaries.length - 1; i++) if (Math.abs(boundaries[i] - startParam) < .001 && Math.abs(boundaries[i + 1] - endParam) < .001) {
							skipIdx = i;
							break;
						}
						const usedPtIds = /* @__PURE__ */ new Set();
						for (let i = 0; i < newLines.length; i++) {
							if (i === skipIdx) continue;
							const line = newLines[i];
							usedPtIds.add(line.p1Id);
							usedPtIds.add(line.p2Id);
							addPrimitive({
								id: line.id,
								type: "line",
								p1Id: line.p1Id,
								p2Id: line.p2Id,
								construction: prim.construction
							});
						}
						await applyTrimConstraints(newlyCreatedPts, intersections);
					}
				} else if (isSketchCircle(prim)) {
					if (intersections.length >= 2) {
						const center = findSketchPoint(activeSketch.primitives, prim.centerId);
						if (!center) return;
						const rawAngles = intersections.map((ix) => normalizeAngle(ix.tSource)).sort((a, b) => a - b);
						const angles = [];
						for (const a of rawAngles) if (angles.length === 0 || a - angles[angles.length - 1] > .01) angles.push(a);
						if (angles.length >= 2 && angles[0] + 2 * Math.PI - angles[angles.length - 1] < .01) angles.pop();
						if (angles.length < 2) return;
						removePrimitive(primId);
						const isAngleClose = (a, b) => {
							const diff = Math.abs(a - b);
							return diff < .02 || Math.abs(diff - 2 * Math.PI) < .02;
						};
						let skipIdx = -1;
						for (let i = 0; i < angles.length; i++) {
							const segStart = angles[i];
							const segEnd = angles[(i + 1) % angles.length];
							if (isAngleClose(normalizeAngle(startParam), segStart) && isAngleClose(normalizeAngle(endParam), segEnd)) {
								skipIdx = i;
								break;
							}
						}
						const anglePtIds = [];
						const newCirclePts = [];
						for (const angle of angles) {
							const x = center.x + prim.radius * Math.cos(angle);
							const y = center.y + prim.radius * Math.sin(angle);
							const existing = findExistingPoint(x, y);
							const ptId = existing ? existing.id : generateId("point");
							anglePtIds.push(ptId);
							if (!existing) {
								addPrimitive({
									id: ptId,
									type: "point",
									x,
									y
								});
								newCirclePts.push({
									id: ptId,
									x,
									y
								});
							}
						}
						for (let i = 0; i < angles.length; i++) {
							if (i === skipIdx) continue;
							const arcStartPtId = anglePtIds[i];
							const arcEndPtId = anglePtIds[(i + 1) % angles.length];
							addPrimitive({
								id: generateId("arc"),
								type: "arc",
								centerId: prim.centerId,
								startId: arcStartPtId,
								endId: arcEndPtId,
								radius: prim.radius,
								construction: prim.construction
							});
						}
						await applyTrimConstraints(newCirclePts, intersections);
						const lineIntersections = /* @__PURE__ */ new Map();
						for (const ix of intersections) {
							const otherPrim = activeSketch.primitives.find((p) => p.id === ix.otherPrimId);
							if (!otherPrim || !isSketchLine(otherPrim)) continue;
							const ixAngle = normalizeAngle(ix.tSource);
							let matchedPtId = null;
							for (let j = 0; j < angles.length; j++) if (Math.abs(ixAngle - angles[j]) < .01) {
								matchedPtId = anglePtIds[j] ?? null;
								break;
							}
							if (!matchedPtId) continue;
							if (ix.tOther < 1e-4 || ix.tOther > .9999) continue;
							if (!lineIntersections.has(ix.otherPrimId)) lineIntersections.set(ix.otherPrimId, []);
							lineIntersections.get(ix.otherPrimId).push({
								tOther: ix.tOther,
								ptId: matchedPtId
							});
						}
						for (const [lineId, splits] of lineIntersections) {
							const linePrim = findSketchLine(activeSketch.primitives, lineId);
							if (!linePrim) continue;
							splits.sort((a, b) => a.tOther - b.tOther);
							removePrimitive(lineId);
							const orderedPtIds = [
								linePrim.p1Id,
								...splits.map((s) => s.ptId),
								linePrim.p2Id
							];
							for (let i = 0; i < orderedPtIds.length - 1; i++) addPrimitive({
								id: generateId("line"),
								type: "line",
								p1Id: orderedPtIds[i],
								p2Id: orderedPtIds[i + 1],
								construction: linePrim.construction
							});
						}
					}
				} else if (isSketchArc(prim)) {
					const center = findSketchPoint(activeSketch.primitives, prim.centerId);
					const arcAngles = getArcAngles(activeSketch, prim);
					if (!center || !arcAngles) return;
					const sA = normalizeAngle(arcAngles.startAngle);
					const eA = normalizeAngle(arcAngles.endAngle);
					const filteredIntersections = intersections.filter((ix) => {
						const ixAngle = normalizeAngle(ix.tSource);
						const dStart = Math.min(Math.abs(ixAngle - sA), 2 * Math.PI - Math.abs(ixAngle - sA));
						const dEnd = Math.min(Math.abs(ixAngle - eA), 2 * Math.PI - Math.abs(ixAngle - eA));
						return dStart > .03 && dEnd > .03;
					});
					if (filteredIntersections.length === 0) {
						removePrimitive(primId);
						await solveSketch();
						return;
					}
					const isAngleCloseArc = (a, b) => {
						const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
						return diff < .02 || Math.abs(diff - 2 * Math.PI) < .02;
					};
					const isStartSegment = isAngleCloseArc(startParam, arcAngles.startAngle);
					const isEndSegment = isAngleCloseArc(endParam, arcAngles.endAngle);
					if (isStartSegment && isEndSegment) removePrimitive(primId);
					else if (isStartSegment) {
						const newX = center.x + prim.radius * Math.cos(endParam);
						const newY = center.y + prim.radius * Math.sin(endParam);
						removePrimitive(primId);
						const existing = findExistingPoint(newX, newY);
						const newPtId = existing ? existing.id : generateId("point");
						if (!existing) addPrimitive({
							id: newPtId,
							type: "point",
							x: newX,
							y: newY
						});
						addPrimitive({
							id: generateId("arc"),
							type: "arc",
							centerId: prim.centerId,
							startId: newPtId,
							endId: prim.endId,
							radius: prim.radius,
							construction: prim.construction
						});
						await applyTrimConstraints(existing ? [] : [{
							id: newPtId,
							x: newX,
							y: newY
						}], intersections);
						for (const ix of filteredIntersections) {
							const otherPrim = activeSketch.primitives.find((p) => p.id === ix.otherPrimId);
							if (!otherPrim || !isSketchLine(otherPrim)) continue;
							if (ix.tOther < 1e-4 || ix.tOther > .9999) continue;
							const ixAngle = normalizeAngle(ix.tSource);
							const trimAngle = normalizeAngle(endParam);
							if (Math.abs(ixAngle - trimAngle) > .02 && Math.abs(ixAngle - trimAngle - 2 * Math.PI) > .02) continue;
							removePrimitive(ix.otherPrimId);
							addPrimitive({
								id: generateId("line"),
								type: "line",
								p1Id: otherPrim.p1Id,
								p2Id: newPtId,
								construction: otherPrim.construction
							});
							addPrimitive({
								id: generateId("line"),
								type: "line",
								p1Id: newPtId,
								p2Id: otherPrim.p2Id,
								construction: otherPrim.construction
							});
						}
					} else if (isEndSegment) {
						const newX = center.x + prim.radius * Math.cos(startParam);
						const newY = center.y + prim.radius * Math.sin(startParam);
						removePrimitive(primId);
						const existing = findExistingPoint(newX, newY);
						const newPtId = existing ? existing.id : generateId("point");
						if (!existing) addPrimitive({
							id: newPtId,
							type: "point",
							x: newX,
							y: newY
						});
						addPrimitive({
							id: generateId("arc"),
							type: "arc",
							centerId: prim.centerId,
							startId: prim.startId,
							endId: newPtId,
							radius: prim.radius,
							construction: prim.construction
						});
						await applyTrimConstraints(existing ? [] : [{
							id: newPtId,
							x: newX,
							y: newY
						}], intersections);
						for (const ix of filteredIntersections) {
							const otherPrim = activeSketch.primitives.find((p) => p.id === ix.otherPrimId);
							if (!otherPrim || !isSketchLine(otherPrim)) continue;
							if (ix.tOther < 1e-4 || ix.tOther > .9999) continue;
							const ixAngle = normalizeAngle(ix.tSource);
							const trimAngle = normalizeAngle(startParam);
							if (Math.abs(ixAngle - trimAngle) > .02 && Math.abs(ixAngle - trimAngle - 2 * Math.PI) > .02) continue;
							removePrimitive(ix.otherPrimId);
							addPrimitive({
								id: generateId("line"),
								type: "line",
								p1Id: otherPrim.p1Id,
								p2Id: newPtId,
								construction: otherPrim.construction
							});
							addPrimitive({
								id: generateId("line"),
								type: "line",
								p1Id: newPtId,
								p2Id: otherPrim.p2Id,
								construction: otherPrim.construction
							});
						}
					} else {
						const arcStart = normalizeAngle(arcAngles.startAngle);
						const ixAngles = filteredIntersections.map((ix) => normalizeAngle(ix.tSource)).filter((a) => isAngleInArcRange(a, arcAngles.startAngle, arcAngles.endAngle)).sort((a, b) => {
							return normalizeAngle(a - arcStart) - normalizeAngle(b - arcStart);
						});
						const allAngles = [
							arcStart,
							...ixAngles,
							normalizeAngle(arcAngles.endAngle)
						];
						let skipIdx = -1;
						for (let i = 0; i < allAngles.length - 1; i++) if (isAngleCloseArc(normalizeAngle(startParam), allAngles[i]) && isAngleCloseArc(normalizeAngle(endParam), allAngles[i + 1])) {
							skipIdx = i;
							break;
						}
						removePrimitive(primId);
						const anglePtIds = [];
						const newArcSplitPts = [];
						for (const angle of ixAngles) {
							const x = center.x + prim.radius * Math.cos(angle);
							const y = center.y + prim.radius * Math.sin(angle);
							const existing = findExistingPoint(x, y);
							const ptId = existing ? existing.id : generateId("point");
							anglePtIds.push(ptId);
							if (!existing) {
								addPrimitive({
									id: ptId,
									type: "point",
									x,
									y
								});
								newArcSplitPts.push({
									id: ptId,
									x,
									y
								});
							}
						}
						const allPtIds = [
							prim.startId,
							...anglePtIds,
							prim.endId
						];
						for (let i = 0; i < allPtIds.length - 1; i++) {
							if (i === skipIdx) continue;
							addPrimitive({
								id: generateId("arc"),
								type: "arc",
								centerId: prim.centerId,
								startId: allPtIds[i],
								endId: allPtIds[i + 1],
								radius: prim.radius,
								construction: prim.construction
							});
						}
						await applyTrimConstraints(newArcSplitPts, filteredIntersections);
						const arcLineIntersections = /* @__PURE__ */ new Map();
						for (const ix of filteredIntersections) {
							const otherPrim = activeSketch.primitives.find((p) => p.id === ix.otherPrimId);
							if (!otherPrim || !isSketchLine(otherPrim)) continue;
							const ixAngle = normalizeAngle(ix.tSource);
							let matchedPtId = null;
							for (let j = 0; j < ixAngles.length; j++) if (Math.abs(ixAngle - ixAngles[j]) < .01) {
								matchedPtId = anglePtIds[j] ?? null;
								break;
							}
							if (!matchedPtId) continue;
							if (ix.tOther < 1e-4 || ix.tOther > .9999) continue;
							if (!arcLineIntersections.has(ix.otherPrimId)) arcLineIntersections.set(ix.otherPrimId, []);
							arcLineIntersections.get(ix.otherPrimId).push({
								tOther: ix.tOther,
								ptId: matchedPtId
							});
						}
						for (const [lineId, splits] of arcLineIntersections) {
							const linePrim = findSketchLine(activeSketch.primitives, lineId);
							if (!linePrim) continue;
							splits.sort((a, b) => a.tOther - b.tOther);
							removePrimitive(lineId);
							const orderedPtIds = [
								linePrim.p1Id,
								...splits.map((s) => s.ptId),
								linePrim.p2Id
							];
							for (let i = 0; i < orderedPtIds.length - 1; i++) addPrimitive({
								id: generateId("line"),
								type: "line",
								p1Id: orderedPtIds[i],
								p2Id: orderedPtIds[i + 1],
								construction: linePrim.construction
							});
						}
					}
				}
				await solveSketch();
			}
		}, [
			activeSketch,
			scene,
			camera,
			renderer,
			cleanupTrimHighlight,
			pushSketchUndo,
			solveSketch,
			removePrimitive,
			addPrimitive,
			generateId,
			applyTrimConstraints,
			sketchTo3DRef,
			requestRender
		]),
		handleExtendMode: useCallback((event, point) => {
			if (!activeSketch) return;
			const pt2d = worldToSketch2D(point, activeSketch.plane);
			if (!pt2d) return;
			const cursorPoint = {
				x: pt2d.x,
				y: pt2d.y
			};
			const snapDist = camera && renderer ? screenPxToSketchUnits(camera, renderer, 15) : .5;
			if (event.type === "mousemove") {
				cleanupTrimHighlight();
				const endpoint = findClosestEndpoint(activeSketch, cursorPoint, snapDist);
				if (!endpoint) return;
				const prim = activeSketch.primitives.find((p) => p.id === endpoint.primitiveId);
				if (!prim) return;
				if (prim.origin) return;
				let target = null;
				if (isSketchLine(prim)) target = findNearestExtendTarget(activeSketch, endpoint.primitiveId, endpoint.isStart);
				else if (isSketchArc(prim)) target = findNearestArcExtendTarget(activeSketch, endpoint.primitiveId, endpoint.isStart);
				if (!target) return;
				if (sketchTo3DRef.current) {
					const endpointPrim = findSketchPoint(activeSketch.primitives, endpoint.pointId);
					if (!endpointPrim) return;
					const group = new THREE.Group();
					const from3d = sketchTo3DRef.current(endpointPrim.x, endpointPrim.y, SKETCH_PREVIEW_Z_LIFT_MM);
					const to3d = sketchTo3DRef.current(target.point.x, target.point.y, SKETCH_PREVIEW_Z_LIFT_MM);
					const dashedLine = createLine2FromPoints([
						from3d.x,
						from3d.y,
						from3d.z,
						to3d.x,
						to3d.y,
						to3d.z
					], SKETCH.extendPreview, 3, true);
					dashedLine.renderOrder = 1e3;
					group.add(dashedLine);
					const circleRadius = screenPxToSketchUnits(camera, renderer, 6);
					const circleGeom = new THREE.CircleGeometry(circleRadius, 24);
					const circleMat = new THREE.MeshBasicMaterial({
						color: SKETCH.extendPreview,
						depthTest: false,
						transparent: true,
						opacity: .8
					});
					const circleMesh = new THREE.Mesh(circleGeom, circleMat);
					const circlePt3d = sketchTo3DRef.current(endpointPrim.x, endpointPrim.y, .03);
					circleMesh.position.set(circlePt3d.x, circlePt3d.y, circlePt3d.z);
					circleMesh.renderOrder = 1e3;
					group.add(circleMesh);
					if (scene) {
						scene.add(group);
						requestRender();
					}
					trimHighlightRef.current = group;
					extendHoveredRef.current = {
						primId: endpoint.primitiveId,
						pointId: endpoint.pointId,
						isStart: endpoint.isStart,
						targetPoint: target.point
					};
				}
			} else if (event.type === "mousedown") {
				if (!extendHoveredRef.current) return;
				const { pointId, targetPoint } = extendHoveredRef.current;
				cleanupTrimHighlight();
				pushSketchUndo();
				updatePrimitive(pointId, {
					x: targetPoint.x,
					y: targetPoint.y
				});
				solveSketch();
			}
		}, [
			activeSketch,
			camera,
			renderer,
			scene,
			cleanupTrimHighlight,
			pushSketchUndo,
			solveSketch,
			updatePrimitive,
			sketchTo3DRef,
			requestRender
		])
	};
}
//#endregion
//#region src/hooks/sketch/hooks/useSketchDrawing.ts
function useSketchDrawing({ generateId, sketchTo3DRef, cleanupInferenceObjects: _cleanupInferenceObjects, showConstraintFeedback, ctrlHeldRef, lastSnapRef }) {
	const { activeSketch, addPrimitive, addConstraintAndSolve, solveSketch, pushSketchUndo } = useCadCore();
	const { scene, camera, renderer, requestRender } = useCadVisualizer();
	const { DOUBLE_CLICK_THRESHOLD, SNAP_DISTANCE } = SKETCH_CONFIG;
	const isDrawingRef = useRef(false);
	const previewObjectRef = useRef(null);
	const centerPointRef = useRef(null);
	const [isChaining, setIsChaining] = useState(false);
	const chainStartPointRef = useRef(null);
	const chainStartPointIdRef = useRef(null);
	const chainStartIsExistingRef = useRef(false);
	const lastClickTimeRef = useRef(0);
	const chainStartSnapRef = useRef(null);
	const [pendingLineDimension, setPendingLineDimension] = useState(null);
	const rectStartRef = useRef(null);
	const arcStepRef = useRef(0);
	const arcStartPointRef = useRef(null);
	const arcEndPointRef = useRef(null);
	const findNearbyPoint = useCallback((point) => {
		if (!activeSketch) return null;
		for (const primitive of activeSketch.primitives) if (isSketchPoint(primitive)) {
			if (Math.sqrt(Math.pow(point.x - primitive.x, 2) + Math.pow(point.y - primitive.y, 2)) < SNAP_DISTANCE) return primitive;
		}
		return null;
	}, [activeSketch, SNAP_DISTANCE]);
	const getOrCreatePoint = useCallback((point, fixed = false) => {
		const nearbyPoint = findNearbyPoint(point);
		if (nearbyPoint) return {
			id: nearbyPoint.id,
			isExisting: true
		};
		const newPoint = {
			id: generateId("pt"),
			type: "point",
			x: point.x,
			y: point.y,
			fixed
		};
		pushSketchUndo();
		addPrimitive(newPoint);
		return {
			id: newPoint.id,
			isExisting: false
		};
	}, [
		findNearbyPoint,
		addPrimitive,
		generateId,
		pushSketchUndo
	]);
	const cleanupDrawingPreview = useCallback(() => {
		if (previewObjectRef.current && scene) {
			scene.remove(previewObjectRef.current);
			const preview = previewObjectRef.current;
			if (preview instanceof Line2 || preview instanceof THREE.Line || preview instanceof THREE.Mesh) {
				preview.geometry.dispose();
				preview.material.dispose();
			}
			previewObjectRef.current = null;
			requestRender();
		}
	}, [scene, requestRender]);
	const autoApplyHVConstraint = useCallback(async (lineId, p1, p2) => {
		const horizontalTolerance = SKETCH_CONFIG.ALIGNMENT_TOLERANCE;
		const verticalTolerance = SKETCH_CONFIG.ALIGNMENT_TOLERANCE;
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		const angle = Math.abs(Math.atan2(dy, dx));
		if (angle < horizontalTolerance || Math.abs(angle - Math.PI) < horizontalTolerance) {
			const result = await addConstraintAndSolve({
				id: generateId("const"),
				type: "horizontal",
				primitiveIds: [lineId],
				driving: true
			});
			if (result.status === "applied") return result.sketch;
			return null;
		}
		if (Math.abs(angle - Math.PI / 2) < verticalTolerance || Math.abs(angle + Math.PI / 2) < verticalTolerance) {
			const result = await addConstraintAndSolve({
				id: generateId("const"),
				type: "vertical",
				primitiveIds: [lineId],
				driving: true
			});
			if (result.status === "applied") return result.sketch;
			return null;
		}
		return null;
	}, [generateId, addConstraintAndSolve]);
	const autoApplyCoincidentConstraint = useCallback(async (pointId, isExisting, snapInfo) => {
		if (isExisting || !snapInfo || !activeSketch) return;
		const sourcePrim = activeSketch.primitives.find((p) => p.id === snapInfo.sourceId);
		if (!sourcePrim) return;
		let constraint = null;
		if (snapInfo.type === "center" && isSketchCircle(sourcePrim)) constraint = {
			id: generateId("const"),
			type: "coincident",
			primitiveIds: [pointId, sourcePrim.centerId],
			driving: true
		};
		else if (snapInfo.type === "quadrant" && (isSketchCircle(sourcePrim) || isSketchArc(sourcePrim))) constraint = {
			id: generateId("const"),
			type: "pointOnCircle",
			primitiveIds: [pointId, snapInfo.sourceId],
			driving: true
		};
		else if (snapInfo.type === "endpoint") {
			if (isSketchLine(sourcePrim)) {
				const p1 = activeSketch.primitives.find((p) => p.id === sourcePrim.p1Id);
				const p2 = activeSketch.primitives.find((p) => p.id === sourcePrim.p2Id);
				let targetPointId = null;
				if (p1 && isSketchPoint(p1)) {
					if (Math.hypot(p1.x - snapInfo.position.x, p1.y - snapInfo.position.y) < .01) targetPointId = p1.id;
				}
				if (!targetPointId && p2 && isSketchPoint(p2)) {
					if (Math.hypot(p2.x - snapInfo.position.x, p2.y - snapInfo.position.y) < .01) targetPointId = p2.id;
				}
				if (targetPointId && targetPointId !== pointId) constraint = {
					id: generateId("const"),
					type: "coincident",
					primitiveIds: [pointId, targetPointId],
					driving: true
				};
			}
		}
		if (constraint) await addConstraintAndSolve(constraint);
	}, [
		activeSketch,
		generateId,
		addConstraintAndSolve
	]);
	const autoApplyPerpendicularConstraint = useCallback(async (lineId, p1, p2) => {
		if (!activeSketch) return false;
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		const angle = Math.atan2(dy, dx);
		const tolerance = SKETCH_CONFIG.ALIGNMENT_TOLERANCE;
		for (const prim of activeSketch.primitives) {
			if (!isSketchLine(prim) || prim.id === lineId) continue;
			const pt1 = activeSketch.primitives.find((p) => p.id === prim.p1Id);
			const pt2 = activeSketch.primitives.find((p) => p.id === prim.p2Id);
			if (!pt1 || !pt2 || !isSketchPoint(pt1) || !isSketchPoint(pt2)) continue;
			const existingAngle = Math.atan2(pt2.y - pt1.y, pt2.x - pt1.x);
			let diff = Math.abs(angle - existingAngle);
			diff = diff % Math.PI;
			if (diff > Math.PI / 2) diff = Math.PI - diff;
			if (Math.abs(diff - Math.PI / 2) < tolerance) {
				if ((await addConstraintAndSolve({
					id: generateId("const"),
					type: "perpendicular",
					primitiveIds: [lineId, prim.id],
					driving: true
				})).status === "applied") return true;
			}
		}
		return false;
	}, [
		activeSketch,
		generateId,
		addConstraintAndSolve
	]);
	const autoApplyTangentConstraint = useCallback(async (lineId, p1, p2) => {
		if (!activeSketch) return false;
		const ldx = p2.x - p1.x;
		const ldy = p2.y - p1.y;
		if (Math.sqrt(ldx * ldx + ldy * ldy) < .01) return false;
		for (const prim of activeSketch.primitives) {
			if (!isSketchCircle(prim) && !isSketchArc(prim)) continue;
			const centerPrim = activeSketch.primitives.find((p) => p.id === prim.centerId);
			if (!centerPrim || !isSketchPoint(centerPrim)) continue;
			const radius = prim.radius;
			const cx = centerPrim.x;
			const cy = centerPrim.y;
			const dist = pointToLineDistance({
				x: cx,
				y: cy
			}, {
				x: p1.x,
				y: p1.y
			}, {
				x: p2.x,
				y: p2.y
			});
			if (Math.abs(dist - radius) < radius * .05 + .02) {
				if ((await addConstraintAndSolve({
					id: generateId("const"),
					type: "tangent",
					primitiveIds: [lineId, prim.id],
					driving: true
				})).status === "applied") return true;
			}
		}
		return false;
	}, [
		activeSketch,
		generateId,
		addConstraintAndSolve
	]);
	const calculateArcFromThreePoints = useCallback((start, end, bulge) => {
		const ax = start.x, ay = start.y;
		const bx = end.x, by = end.y;
		const cx = bulge.x, cy = bulge.y;
		const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
		if (Math.abs(d) < 1e-10) return null;
		const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
		const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
		return {
			center: new THREE.Vector3(ux, uy, 0),
			radius: Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2)
		};
	}, []);
	const create3PointArcPreview = useCallback((start, end, bulge) => {
		const arc = calculateArcFromThreePoints(start, end, bulge);
		if (!arc) {
			const s3d = sketchTo3DRef.current(start.x, start.y, SKETCH_PLANE_Z_LIFT_MM);
			const b3d = sketchTo3DRef.current(bulge.x, bulge.y, SKETCH_PLANE_Z_LIFT_MM);
			const e3d = sketchTo3DRef.current(end.x, end.y, SKETCH_PLANE_Z_LIFT_MM);
			return createLine2FromPoints([
				s3d.x,
				s3d.y,
				s3d.z,
				b3d.x,
				b3d.y,
				b3d.z,
				e3d.x,
				e3d.y,
				e3d.z
			], COLORS.preview, 1.5);
		}
		const { center, radius } = arc;
		const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
		const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
		const bulgeAngle = Math.atan2(bulge.y - center.y, bulge.x - center.x);
		let angleDiff = endAngle - startAngle;
		while (angleDiff < 0) angleDiff += Math.PI * 2;
		while (angleDiff > Math.PI * 2) angleDiff -= Math.PI * 2;
		let bulgeOnArc = bulgeAngle - startAngle;
		while (bulgeOnArc < 0) bulgeOnArc += Math.PI * 2;
		while (bulgeOnArc > Math.PI * 2) bulgeOnArc -= Math.PI * 2;
		const sweepAngle = bulgeOnArc <= angleDiff ? angleDiff : -(Math.PI * 2 - angleDiff);
		const segments = getAdaptiveSegments(camera, renderer, radius, Math.abs(sweepAngle));
		const positions = [];
		for (let i = 0; i <= segments; i++) {
			const angle = startAngle + sweepAngle * (i / segments);
			const sx = center.x + Math.cos(angle) * radius;
			const sy = center.y + Math.sin(angle) * radius;
			const p3d = sketchTo3DRef.current(sx, sy, SKETCH_PLANE_Z_LIFT_MM);
			positions.push(p3d.x, p3d.y, p3d.z);
		}
		return createLine2FromPoints(positions, COLORS.preview, 1.5);
	}, [
		calculateArcFromThreePoints,
		camera,
		renderer,
		sketchTo3DRef
	]);
	const handleLineDraw = useCallback(async (event, point) => {
		const now = Date.now();
		if (event.type === "mousedown") {
			if (isChaining && chainStartPointRef.current) {
				if (now - lastClickTimeRef.current < DOUBLE_CLICK_THRESHOLD) {
					cleanupDrawingPreview();
					setIsChaining(false);
					chainStartPointRef.current = null;
					chainStartPointIdRef.current = null;
					chainStartIsExistingRef.current = false;
					lastClickTimeRef.current = 0;
					return;
				}
			}
			lastClickTimeRef.current = now;
			if (!isChaining) {
				pushSketchUndo();
				const { id: p1Id, isExisting: p1IsExisting } = getOrCreatePoint(point);
				const p1Prim = activeSketch?.primitives.find((p) => p.id === p1Id);
				chainStartPointRef.current = p1Prim && isSketchPoint(p1Prim) ? new THREE.Vector3(p1Prim.x, p1Prim.y, 0) : point.clone();
				chainStartPointIdRef.current = p1Id;
				chainStartIsExistingRef.current = p1IsExisting;
				chainStartSnapRef.current = lastSnapRef.current;
				setIsChaining(true);
			} else if (chainStartPointRef.current) {
				pushSketchUndo();
				const startPoint = chainStartPointRef.current.clone();
				const { id: p2Id, isExisting: p2IsExisting } = getOrCreatePoint(point);
				const p2Prim = activeSketch?.primitives.find((p) => p.id === p2Id);
				const actualP2 = p2Prim && isSketchPoint(p2Prim) ? new THREE.Vector3(p2Prim.x, p2Prim.y, 0) : point.clone();
				if (p2Id !== chainStartPointIdRef.current) {
					const lineId = generateId("ln");
					addPrimitive({
						id: lineId,
						type: "line",
						p1Id: chainStartPointIdRef.current,
						p2Id
					});
					const suppressAuto = ctrlHeldRef.current;
					const suppressHV = suppressAuto || p2IsExisting || chainStartIsExistingRef.current;
					let hvApplied = false;
					if (!suppressHV) hvApplied = await autoApplyHVConstraint(lineId, startPoint, actualP2) !== null;
					let perpApplied = false;
					if (!suppressAuto && !hvApplied) perpApplied = await autoApplyPerpendicularConstraint(lineId, startPoint, actualP2);
					if (!suppressAuto && !hvApplied && !perpApplied) await autoApplyTangentConstraint(lineId, startPoint, actualP2);
					if (!suppressAuto) {
						await autoApplyCoincidentConstraint(chainStartPointIdRef.current, chainStartIsExistingRef.current, chainStartSnapRef.current);
						await autoApplyCoincidentConstraint(p2Id, p2IsExisting, lastSnapRef.current);
					}
					const finalSketch = await solveSketch();
					let finalP2 = actualP2.clone();
					if (finalSketch) {
						const solvedPoint = finalSketch.primitives.find((p) => p.id === p2Id);
						if (solvedPoint && isSketchPoint(solvedPoint)) finalP2 = new THREE.Vector3(solvedPoint.x, solvedPoint.y, 0);
					}
					const lineLength = startPoint.distanceTo(finalP2);
					const mid2D = new THREE.Vector3().addVectors(startPoint, finalP2).multiplyScalar(.5);
					const midpoint = sketchTo3DRef.current(mid2D.x, mid2D.y, 0);
					setPendingLineDimension({
						lineId,
						p1: startPoint.clone(),
						p2: finalP2.clone(),
						length: lineLength,
						midpoint
					});
					chainStartPointRef.current = finalP2.clone();
					chainStartPointIdRef.current = p2Id;
					chainStartIsExistingRef.current = p2IsExisting;
					chainStartSnapRef.current = lastSnapRef.current;
				}
			}
		} else if (event.type === "mousemove") {
			if (!isChaining || !chainStartPointRef.current) return;
			cleanupDrawingPreview();
			const preview = createLinePreview(chainStartPointRef.current, point, sketchTo3DRef.current);
			if (scene) {
				scene.add(preview);
				previewObjectRef.current = preview;
				requestRender();
			}
		}
	}, [
		scene,
		cleanupDrawingPreview,
		getOrCreatePoint,
		addPrimitive,
		solveSketch,
		generateId,
		isChaining,
		autoApplyHVConstraint,
		autoApplyCoincidentConstraint,
		autoApplyPerpendicularConstraint,
		autoApplyTangentConstraint,
		activeSketch,
		pushSketchUndo,
		DOUBLE_CLICK_THRESHOLD,
		ctrlHeldRef,
		lastSnapRef,
		sketchTo3DRef,
		requestRender
	]);
	const handleRectangleDraw = useCallback(async (event, point) => {
		if (event.type === "mousedown") {
			isDrawingRef.current = true;
			rectStartRef.current = point.clone();
		} else if (event.type === "mousemove") {
			if (!isDrawingRef.current || !rectStartRef.current) return;
			cleanupDrawingPreview();
			const preview = createRectanglePreview(rectStartRef.current, point, sketchTo3DRef.current);
			if (scene) {
				scene.add(preview);
				previewObjectRef.current = preview;
				requestRender();
			}
		} else if (event.type === "mouseup") {
			if (!isDrawingRef.current || !rectStartRef.current) return;
			cleanupDrawingPreview();
			const start = rectStartRef.current;
			const width = Math.abs(point.x - start.x);
			const height = Math.abs(point.y - start.y);
			if (width > .05 && height > .05) {
				const minX = Math.min(start.x, point.x);
				const maxX = Math.max(start.x, point.x);
				const minY = Math.min(start.y, point.y);
				const maxY = Math.max(start.y, point.y);
				pushSketchUndo();
				const blId = generateId("pt");
				const brId = generateId("pt");
				const trId = generateId("pt");
				const tlId = generateId("pt");
				const blPt = {
					id: blId,
					type: "point",
					x: minX,
					y: minY
				};
				const brPt = {
					id: brId,
					type: "point",
					x: maxX,
					y: minY
				};
				const trPt = {
					id: trId,
					type: "point",
					x: maxX,
					y: maxY
				};
				const tlPt = {
					id: tlId,
					type: "point",
					x: minX,
					y: maxY
				};
				addPrimitive(blPt);
				addPrimitive(brPt);
				addPrimitive(trPt);
				addPrimitive(tlPt);
				const bottomId = generateId("ln");
				const rightId = generateId("ln");
				const topId = generateId("ln");
				const leftId = generateId("ln");
				const bottomLine = {
					id: bottomId,
					type: "line",
					p1Id: blId,
					p2Id: brId
				};
				const rightLine = {
					id: rightId,
					type: "line",
					p1Id: brId,
					p2Id: trId
				};
				const topLine = {
					id: topId,
					type: "line",
					p1Id: trId,
					p2Id: tlId
				};
				const leftLine = {
					id: leftId,
					type: "line",
					p1Id: tlId,
					p2Id: blId
				};
				addPrimitive(bottomLine);
				addPrimitive(rightLine);
				addPrimitive(topLine);
				addPrimitive(leftLine);
				const hBottom = {
					id: generateId("const"),
					type: "horizontal",
					primitiveIds: [bottomId],
					driving: true
				};
				const hTop = {
					id: generateId("const"),
					type: "horizontal",
					primitiveIds: [topId],
					driving: true
				};
				const vRight = {
					id: generateId("const"),
					type: "vertical",
					primitiveIds: [rightId],
					driving: true
				};
				const vLeft = {
					id: generateId("const"),
					type: "vertical",
					primitiveIds: [leftId],
					driving: true
				};
				await addConstraintAndSolve(hBottom);
				await addConstraintAndSolve(hTop);
				await addConstraintAndSolve(vRight);
				await addConstraintAndSolve(vLeft);
				await solveSketch();
			}
			isDrawingRef.current = false;
			rectStartRef.current = null;
		}
	}, [
		scene,
		cleanupDrawingPreview,
		addPrimitive,
		addConstraintAndSolve,
		solveSketch,
		generateId,
		pushSketchUndo,
		sketchTo3DRef,
		requestRender
	]);
	const handleCircleDraw = useCallback(async (event, point) => {
		if (event.type === "mousedown") {
			isDrawingRef.current = true;
			centerPointRef.current = point.clone();
		} else if (event.type === "mousemove") {
			if (!isDrawingRef.current || !centerPointRef.current) return;
			cleanupDrawingPreview();
			const radius = centerPointRef.current.distanceTo(point);
			const preview = createCirclePreview(centerPointRef.current, radius, sketchTo3DRef.current, camera, renderer);
			if (scene) {
				scene.add(preview);
				previewObjectRef.current = preview;
				requestRender();
			}
		} else if (event.type === "mouseup") {
			if (!isDrawingRef.current || !centerPointRef.current) return;
			cleanupDrawingPreview();
			const radius = centerPointRef.current.distanceTo(point);
			if (radius > .1) {
				pushSketchUndo();
				const { id: centerId } = getOrCreatePoint(centerPointRef.current);
				addPrimitive({
					id: generateId("cir"),
					type: "circle",
					centerId,
					radius
				});
				await solveSketch();
			}
			isDrawingRef.current = false;
			centerPointRef.current = null;
		}
	}, [
		scene,
		cleanupDrawingPreview,
		camera,
		renderer,
		getOrCreatePoint,
		addPrimitive,
		solveSketch,
		generateId,
		pushSketchUndo,
		sketchTo3DRef,
		requestRender
	]);
	const handleArcDraw = useCallback(async (event, point) => {
		if (event.type === "mousedown") {
			if (arcStepRef.current === 0) {
				arcStartPointRef.current = point.clone();
				arcStepRef.current = 1;
			} else if (arcStepRef.current === 1) {
				arcEndPointRef.current = point.clone();
				arcStepRef.current = 2;
			} else if (arcStepRef.current === 2) {
				cleanupDrawingPreview();
				if (arcStartPointRef.current && arcEndPointRef.current) {
					const arcSpec = calculateArcFromThreePoints(arcStartPointRef.current, arcEndPointRef.current, point);
					if (arcSpec) {
						pushSketchUndo();
						const { center, radius } = arcSpec;
						const { id: centerId } = getOrCreatePoint(center);
						const { id: startId } = getOrCreatePoint(arcStartPointRef.current);
						const { id: endId } = getOrCreatePoint(arcEndPointRef.current);
						const startAngle = Math.atan2(arcStartPointRef.current.y - center.y, arcStartPointRef.current.x - center.x);
						const endAngle = Math.atan2(arcEndPointRef.current.y - center.y, arcEndPointRef.current.x - center.x);
						const bulgeAngle = Math.atan2(point.y - center.y, point.x - center.x);
						let angleDiff = endAngle - startAngle;
						while (angleDiff < 0) angleDiff += Math.PI * 2;
						while (angleDiff > Math.PI * 2) angleDiff -= Math.PI * 2;
						let bulgeOffset = bulgeAngle - startAngle;
						while (bulgeOffset < 0) bulgeOffset += Math.PI * 2;
						while (bulgeOffset > Math.PI * 2) bulgeOffset -= Math.PI * 2;
						const bulgeOnCCW = bulgeOffset <= angleDiff;
						addPrimitive({
							id: generateId("arc"),
							type: "arc",
							centerId,
							startId: bulgeOnCCW ? startId : endId,
							endId: bulgeOnCCW ? endId : startId,
							radius
						});
						await solveSketch();
					}
				}
				arcStepRef.current = 0;
				arcStartPointRef.current = null;
				arcEndPointRef.current = null;
			}
		} else if (event.type === "mousemove") {
			cleanupDrawingPreview();
			if (arcStepRef.current === 1 && arcStartPointRef.current) {
				const preview = createLinePreview(arcStartPointRef.current, point, sketchTo3DRef.current);
				if (scene) {
					scene.add(preview);
					previewObjectRef.current = preview;
					requestRender();
				}
			} else if (arcStepRef.current === 2 && arcStartPointRef.current && arcEndPointRef.current) {
				const preview = create3PointArcPreview(arcStartPointRef.current, arcEndPointRef.current, point);
				if (scene && preview) {
					scene.add(preview);
					previewObjectRef.current = preview;
					requestRender();
				}
			}
		}
	}, [
		scene,
		cleanupDrawingPreview,
		create3PointArcPreview,
		calculateArcFromThreePoints,
		getOrCreatePoint,
		addPrimitive,
		solveSketch,
		generateId,
		pushSketchUndo,
		sketchTo3DRef,
		requestRender
	]);
	const handlePointDraw = useCallback(async (event, point) => {
		if (event.type === "mousedown") {
			pushSketchUndo();
			addPrimitive({
				id: generateId("pt"),
				type: "point",
				x: point.x,
				y: point.y,
				fixed: false
			});
			await solveSketch();
		}
	}, [
		addPrimitive,
		solveSketch,
		generateId,
		pushSketchUndo
	]);
	const cancelCurrentOperation = useCallback(() => {
		cleanupDrawingPreview();
		setPendingLineDimension(null);
		if (isChaining) {
			setIsChaining(false);
			chainStartPointRef.current = null;
			chainStartPointIdRef.current = null;
			chainStartIsExistingRef.current = false;
			lastClickTimeRef.current = 0;
		}
		isDrawingRef.current = false;
		centerPointRef.current = null;
		rectStartRef.current = null;
		arcStepRef.current = 0;
		arcStartPointRef.current = null;
		arcEndPointRef.current = null;
	}, [cleanupDrawingPreview, isChaining]);
	const clearPendingLineDimension = useCallback(() => {
		setPendingLineDimension(null);
	}, []);
	return {
		isChaining,
		pendingLineDimension,
		handleLineDraw,
		handleRectangleDraw,
		handleCircleDraw,
		handleArcDraw,
		handlePointDraw,
		cancelCurrentOperation,
		clearPendingLineDimension,
		applyLineLengthConstraint: useCallback(async (lineId, length) => {
			pushSketchUndo();
			showConstraintFeedback((await addConstraintAndSolve({
				id: generateId("const"),
				type: "distance",
				primitiveIds: [lineId],
				value: length,
				driving: true
			})).status);
			clearPendingLineDimension();
		}, [
			generateId,
			addConstraintAndSolve,
			clearPendingLineDimension,
			pushSketchUndo,
			showConstraintFeedback
		]),
		cleanupDrawingPreview,
		isDrawingActive: useCallback(() => {
			return isChaining || isDrawingRef.current || arcStepRef.current > 0;
		}, [isChaining]),
		getChainStartPoint: useCallback(() => chainStartPointRef.current, [])
	};
}
//#endregion
//#region src/hooks/sketch/hooks/useSketchSelection.ts
function useSketchSelection({ generateId: _generateId, sketchTo3DRef, activeSketchRef, setSelectedConstraintId, setEditingConstraintId, setContextMenu, closeContextMenu, sketchObjectsRef }) {
	const { activeSketch, updateConstraint, updatePrimitivesAndSolve, solveSketch, pushSketchUndo } = useCadCore();
	const { scene, camera, renderer, getMouseIntersection, requestRender } = useCadVisualizer();
	const { GLYPH_DRAG_THRESHOLD_PX, POINT_HIT_RADIUS_PX, LINE_HIT_THRESHOLD } = SKETCH_CONFIG;
	const [selectedPrimitives, setSelectedPrimitives] = useState([]);
	const isDraggingRef = useRef(false);
	const dragStartPointRef = useRef(null);
	const draggedPrimitiveIdsRef = useRef([]);
	const dragOriginalPositionsRef = useRef(/* @__PURE__ */ new Map());
	const pendingDragUpdatesRef = useRef(null);
	const dragRafIdRef = useRef(null);
	useEffect(() => {
		return () => {
			if (dragRafIdRef.current !== null) {
				cancelAnimationFrame(dragRafIdRef.current);
				dragRafIdRef.current = null;
			}
		};
	}, []);
	const isGlyphDraggingRef = useRef(false);
	const glyphDragConstraintIdRef = useRef(null);
	const glyphDragStartScreenRef = useRef(null);
	const glyphDragAnchor2DRef = useRef(null);
	const glyphDragLeaderRef = useRef(null);
	const glyphDragSpriteRef = useRef(null);
	const lastGlyphClickRef = useRef(null);
	const { raycastToObjects } = useRaycastToObjects(LINE_HIT_THRESHOLD);
	const findConnectedPrimitives = useCallback((primitiveId) => {
		if (!activeSketch) return [primitiveId];
		const connected = /* @__PURE__ */ new Set();
		const visited = /* @__PURE__ */ new Set();
		const queue = [primitiveId];
		while (queue.length > 0) {
			const currentId = queue.shift();
			if (visited.has(currentId)) continue;
			visited.add(currentId);
			const primitive = activeSketch.primitives.find((p) => p.id === currentId);
			if (!primitive) continue;
			const pointIds = [];
			if (isSketchLine(primitive)) {
				pointIds.push(primitive.p1Id, primitive.p2Id);
				connected.add(currentId);
			} else if (isSketchCircle(primitive)) {
				pointIds.push(primitive.centerId);
				connected.add(currentId);
			} else if (isSketchArc(primitive)) {
				pointIds.push(primitive.centerId, primitive.startId, primitive.endId);
				connected.add(currentId);
			} else if (isSketchPoint(primitive)) pointIds.push(currentId);
			for (const pointId of pointIds) for (const other of activeSketch.primitives) {
				if (visited.has(other.id)) continue;
				let sharesPoint = false;
				if (isSketchLine(other)) sharesPoint = other.p1Id === pointId || other.p2Id === pointId;
				else if (isSketchCircle(other)) sharesPoint = other.centerId === pointId;
				else if (isSketchArc(other)) sharesPoint = other.centerId === pointId || other.startId === pointId || other.endId === pointId;
				if (sharesPoint) queue.push(other.id);
			}
		}
		return Array.from(connected);
	}, [activeSketch]);
	const selectPrimitive = useCallback((id, addToSelection) => {
		setSelectedPrimitives((prev) => {
			if (addToSelection) {
				if (prev.includes(id)) return prev.filter((p) => p !== id);
				return [...prev, id];
			} else {
				if (prev.length === 1 && prev[0] === id) return [];
				return [id];
			}
		});
	}, []);
	const clearSelection = useCallback(() => {
		setSelectedPrimitives([]);
		setSelectedConstraintId(null);
	}, [setSelectedConstraintId]);
	const handleDragMove = useCallback((event) => {
		const currentSketch = activeSketchRef.current;
		if (!isDraggingRef.current || !dragStartPointRef.current || !currentSketch) return;
		const point3D = getMouseIntersection(event);
		if (!point3D) return;
		const point = worldToSketch2D(point3D, currentSketch.plane);
		const deltaX = point.x - dragStartPointRef.current.x;
		const deltaY = point.y - dragStartPointRef.current.y;
		const updates = /* @__PURE__ */ new Map();
		for (const primitiveId of draggedPrimitiveIdsRef.current) {
			const originalPos = dragOriginalPositionsRef.current.get(primitiveId);
			if (!originalPos) continue;
			updates.set(primitiveId, {
				x: originalPos.x + deltaX,
				y: originalPos.y + deltaY
			});
		}
		pendingDragUpdatesRef.current = updates;
		if (dragRafIdRef.current === null) dragRafIdRef.current = requestAnimationFrame(() => {
			dragRafIdRef.current = null;
			const pending = pendingDragUpdatesRef.current;
			if (pending) {
				pendingDragUpdatesRef.current = null;
				updatePrimitivesAndSolve(pending);
			}
		});
	}, [
		getMouseIntersection,
		updatePrimitivesAndSolve,
		activeSketchRef
	]);
	const handleDragEnd = useCallback(async () => {
		if (!isDraggingRef.current) return;
		isDraggingRef.current = false;
		dragStartPointRef.current = null;
		draggedPrimitiveIdsRef.current = [];
		dragOriginalPositionsRef.current.clear();
		if (dragRafIdRef.current !== null) {
			cancelAnimationFrame(dragRafIdRef.current);
			dragRafIdRef.current = null;
		}
		const pending = pendingDragUpdatesRef.current;
		if (pending) {
			pendingDragUpdatesRef.current = null;
			await updatePrimitivesAndSolve(pending);
		}
		await solveSketch();
	}, [solveSketch, updatePrimitivesAndSolve]);
	const startDrag = useCallback((event, primitiveIds) => {
		if (!activeSketch) return;
		const point3D = getMouseIntersection(event);
		if (!point3D) return;
		const point = worldToSketch2D(point3D, activeSketch.plane);
		const pointsToMove = [];
		for (const primitiveId of primitiveIds) {
			const primitive = activeSketch.primitives.find((p) => p.id === primitiveId);
			if (!primitive) continue;
			if (isSketchPoint(primitive)) pointsToMove.push(primitiveId);
			else if (isSketchLine(primitive)) {
				if (!pointsToMove.includes(primitive.p1Id)) pointsToMove.push(primitive.p1Id);
				if (!pointsToMove.includes(primitive.p2Id)) pointsToMove.push(primitive.p2Id);
			} else if (isSketchCircle(primitive)) {
				if (!pointsToMove.includes(primitive.centerId)) pointsToMove.push(primitive.centerId);
			} else if (isSketchArc(primitive)) {
				if (!pointsToMove.includes(primitive.centerId)) pointsToMove.push(primitive.centerId);
				if (!pointsToMove.includes(primitive.startId)) pointsToMove.push(primitive.startId);
				if (!pointsToMove.includes(primitive.endId)) pointsToMove.push(primitive.endId);
			}
		}
		const movablePoints = pointsToMove.filter((pointId) => {
			const p = activeSketch.primitives.find((pr) => pr.id === pointId);
			return !(p && isSketchPoint(p) && p.fixed);
		});
		dragOriginalPositionsRef.current.clear();
		for (const pointId of movablePoints) {
			const pointPrimitive = activeSketch.primitives.find((p) => p.id === pointId);
			if (pointPrimitive && isSketchPoint(pointPrimitive)) dragOriginalPositionsRef.current.set(pointId, {
				x: pointPrimitive.x,
				y: pointPrimitive.y
			});
		}
		pushSketchUndo();
		isDraggingRef.current = true;
		dragStartPointRef.current = point.clone();
		draggedPrimitiveIdsRef.current = movablePoints;
	}, [
		activeSketch,
		getMouseIntersection,
		pushSketchUndo
	]);
	const cleanupGlyphDrag = useCallback(() => {
		if (glyphDragLeaderRef.current && scene) {
			scene.remove(glyphDragLeaderRef.current);
			glyphDragLeaderRef.current.geometry.dispose();
			glyphDragLeaderRef.current.material.dispose();
			requestRender();
		}
		isGlyphDraggingRef.current = false;
		glyphDragConstraintIdRef.current = null;
		glyphDragStartScreenRef.current = null;
		glyphDragAnchor2DRef.current = null;
		glyphDragSpriteRef.current = null;
		glyphDragLeaderRef.current = null;
	}, [scene, requestRender]);
	return {
		selectedPrimitives,
		selectPrimitive,
		clearSelection,
		handleSelectMode: useCallback((event, isRightClick = false) => {
			if (event.type === "mousemove" && glyphDragConstraintIdRef.current) {
				const startScreen = glyphDragStartScreenRef.current;
				if (!startScreen) return;
				const dx = event.clientX - startScreen.x;
				const dy = event.clientY - startScreen.y;
				const dist = Math.sqrt(dx * dx + dy * dy);
				if (!isGlyphDraggingRef.current && dist >= GLYPH_DRAG_THRESHOLD_PX) isGlyphDraggingRef.current = true;
				if (isGlyphDraggingRef.current) {
					const point3D = getMouseIntersection(event);
					if (point3D && activeSketch) {
						const sketch2D = worldToSketch2D(point3D, activeSketch.plane);
						const anchor = glyphDragAnchor2DRef.current;
						if (anchor) {
							const newOffsetX = sketch2D.x - anchor.x;
							const newOffsetY = sketch2D.y - anchor.y;
							const sprite = glyphDragSpriteRef.current;
							if (sprite) {
								const plane = activeSketch.plane;
								const newPos = new THREE.Vector3().copy(plane.origin).addScaledVector(plane.xAxis, anchor.x + newOffsetX).addScaledVector(plane.yAxis, anchor.y + newOffsetY);
								newPos.addScaledVector(plane.normal, .15);
								sprite.position.copy(newPos);
								const geoAnchor = sprite.userData.geometryAnchor2D || anchor;
								const geoPos = new THREE.Vector3().copy(plane.origin).addScaledVector(plane.xAxis, geoAnchor.x).addScaledVector(plane.yAxis, geoAnchor.y);
								geoPos.addScaledVector(plane.normal, .15);
								if (glyphDragLeaderRef.current) {
									scene?.remove(glyphDragLeaderRef.current);
									glyphDragLeaderRef.current.geometry.dispose();
									glyphDragLeaderRef.current.material.dispose();
								}
								if (Math.abs(newOffsetX) > .01 || Math.abs(newOffsetY) > .01) {
									const leaderLine = createLine2FromPoints([
										geoPos.x,
										geoPos.y,
										geoPos.z,
										newPos.x,
										newPos.y,
										newPos.z
									], SKETCH.constraintGlyph, .5);
									leaderLine.renderOrder = 999;
									scene?.add(leaderLine);
									glyphDragLeaderRef.current = leaderLine;
								} else glyphDragLeaderRef.current = null;
								requestRender();
							}
						}
					}
				}
				return;
			}
			if (event.type === "mouseup" && glyphDragConstraintIdRef.current) {
				const constraintId = glyphDragConstraintIdRef.current;
				if (isGlyphDraggingRef.current) {
					const point3D = getMouseIntersection(event);
					if (point3D && activeSketch) {
						const sketch2D = worldToSketch2D(point3D, activeSketch.plane);
						const anchor = glyphDragAnchor2DRef.current;
						if (anchor) {
							const finalOffset = {
								x: sketch2D.x - anchor.x,
								y: sketch2D.y - anchor.y
							};
							pushSketchUndo();
							updateConstraint(constraintId, { labelOffset: finalOffset });
						}
					}
					if (glyphDragLeaderRef.current && scene) {
						scene.remove(glyphDragLeaderRef.current);
						glyphDragLeaderRef.current.geometry.dispose();
						glyphDragLeaderRef.current.material.dispose();
						const idx = sketchObjectsRef.current.indexOf(glyphDragLeaderRef.current);
						if (idx >= 0) sketchObjectsRef.current.splice(idx, 1);
						requestRender();
					}
				} else {
					const now = Date.now();
					const lastClick = lastGlyphClickRef.current;
					if (lastClick && lastClick.constraintId === constraintId && now - lastClick.time < SKETCH_CONFIG.DOUBLE_CLICK_THRESHOLD) {
						const constraint = activeSketch?.constraints.find((c) => c.id === constraintId);
						if (constraint && isDimensionalConstraint(constraint)) {
							setEditingConstraintId(constraintId);
							lastGlyphClickRef.current = null;
						}
					} else {
						lastGlyphClickRef.current = {
							constraintId,
							time: now
						};
						setSelectedConstraintId(constraintId);
						setSelectedPrimitives([]);
					}
				}
				isGlyphDraggingRef.current = false;
				glyphDragConstraintIdRef.current = null;
				glyphDragStartScreenRef.current = null;
				glyphDragAnchor2DRef.current = null;
				glyphDragSpriteRef.current = null;
				glyphDragLeaderRef.current = null;
				return;
			}
			if (event.type === "mousemove" && isDraggingRef.current) {
				handleDragMove(event);
				return;
			}
			if (event.type === "mouseup" && isDraggingRef.current) {
				handleDragEnd();
				return;
			}
			if (event.type !== "mousedown") return;
			const objects = sketchObjectsRef.current;
			if (objects.length === 0) {
				if (!isRightClick) clearSelection();
				closeContextMenu();
				return;
			}
			if (camera && renderer) {
				const glyphSprites = sketchObjectsRef.current.filter((obj) => obj.userData.isConstraintGlyph && obj instanceof THREE.Sprite);
				if (glyphSprites.length > 0) {
					const rect = renderer.domElement.getBoundingClientRect();
					const mouse = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
					const raycaster = new THREE.Raycaster();
					raycaster.setFromCamera(mouse, camera);
					const glyphHits = raycaster.intersectObjects(glyphSprites);
					if (glyphHits.length > 0) {
						const hitGlyph = glyphHits[0].object;
						const constraintId = hitGlyph.userData.constraintId;
						if (isRightClick) setContextMenu({
							visible: true,
							x: event.clientX,
							y: event.clientY,
							primitiveIds: [],
							primitiveTypes: [],
							constraintId
						});
						else {
							glyphDragConstraintIdRef.current = constraintId;
							glyphDragStartScreenRef.current = {
								x: event.clientX,
								y: event.clientY
							};
							glyphDragSpriteRef.current = hitGlyph;
							glyphDragAnchor2DRef.current = hitGlyph.userData.anchor2D || null;
						}
						return;
					}
				}
			}
			const handleFoundPrimitive = (primitiveId, primitiveType) => {
				if (isRightClick) {
					let primitiveIds;
					let primitiveTypes;
					if (selectedPrimitives.includes(primitiveId)) {
						primitiveIds = [...selectedPrimitives];
						primitiveTypes = primitiveIds.map((id) => {
							return (activeSketch?.primitives.find((p) => p.id === id))?.type || "unknown";
						});
					} else {
						primitiveIds = [primitiveId];
						primitiveTypes = [primitiveType];
					}
					setContextMenu({
						visible: true,
						x: event.clientX,
						y: event.clientY,
						primitiveIds,
						primitiveTypes
					});
					return;
				}
				const addToSelection = event.shiftKey;
				if (selectedPrimitives.includes(primitiveId) && !addToSelection) {
					startDrag(event, findConnectedPrimitives(primitiveId));
					return;
				}
				selectPrimitive(primitiveId, addToSelection);
			};
			if (renderer && camera && activeSketch) {
				const rect = renderer.domElement.getBoundingClientRect();
				const clickX = event.clientX - rect.left;
				const clickY = event.clientY - rect.top;
				let closestPointId = null;
				let closestDist = POINT_HIT_RADIUS_PX;
				for (const primitive of activeSketch.primitives) {
					if (!isSketchPoint(primitive)) continue;
					const projected = sketchTo3DRef.current(primitive.x, primitive.y, .1).project(camera);
					const screenX = (projected.x * .5 + .5) * rect.width;
					const screenY = (-projected.y * .5 + .5) * rect.height;
					const dist = Math.hypot(screenX - clickX, screenY - clickY);
					if (dist < closestDist) {
						closestDist = dist;
						closestPointId = primitive.id;
					}
				}
				if (closestPointId) {
					handleFoundPrimitive(closestPointId, "point");
					return;
				}
			}
			const intersects = raycastToObjects(event, objects, true);
			if (intersects.length > 0) for (const intersect of intersects) {
				let obj = intersect.object;
				while (obj) {
					if (obj.userData.primitiveId) {
						handleFoundPrimitive(obj.userData.primitiveId, obj.userData.type);
						return;
					}
					obj = obj.parent;
				}
			}
			if (isRightClick) closeContextMenu();
			else if (!event.shiftKey) clearSelection();
		}, [
			raycastToObjects,
			selectPrimitive,
			clearSelection,
			closeContextMenu,
			selectedPrimitives,
			activeSketch,
			startDrag,
			handleDragMove,
			handleDragEnd,
			findConnectedPrimitives,
			renderer,
			camera,
			scene,
			getMouseIntersection,
			pushSketchUndo,
			updateConstraint,
			setContextMenu,
			setSelectedConstraintId,
			setEditingConstraintId,
			sketchObjectsRef,
			sketchTo3DRef,
			GLYPH_DRAG_THRESHOLD_PX,
			POINT_HIT_RADIUS_PX,
			requestRender
		]),
		cleanupGlyphDrag,
		isGlyphDraggingActiveRef: glyphDragConstraintIdRef
	};
}
//#endregion
//#region src/hooks/sketch/hooks/useSketchConstraints.ts
/**
* Constraint application subsystem for sketch mode.
* Owns: applyConstraint, applyConstraintToContextMenuPrimitives, the live
* preview pipeline (handleConstraintPreviewChange/Cancel), constraint+primitive
* deletion, fix-point toggle, getCurrentValueForConstraint pre-fill, and the
* pointOnLine closest-line picker.
*/
function useSketchConstraints({ generateId, activeSketchRef, selectedPrimitives, clearSelection, contextMenu, setContextMenu, closeContextMenu, setSelectedConstraintId, showConstraintFeedback, isPreviewingRef, previewDebounceRef, previewConstraintIdRef }) {
	const { activeSketch, addConstraintAndSolve, removeConstraint, updatePrimitive, removePrimitive, solveSketch, pushSketchUndo, previewConstraint, commitConstraintPreview, cancelConstraintPreview } = useCadCore();
	const getDistanceToLine = useCallback((px, py, lineId) => {
		if (!activeSketch) return Infinity;
		const line = activeSketch.primitives.find((p) => p.id === lineId);
		if (!line || !isSketchLine(line)) return Infinity;
		const p1 = activeSketch.primitives.find((p) => p.id === line.p1Id);
		const p2 = activeSketch.primitives.find((p) => p.id === line.p2Id);
		if (!p1 || !p2 || !isSketchPoint(p1) || !isSketchPoint(p2)) return Infinity;
		const x1 = p1.x, y1 = p1.y;
		const x2 = p2.x, y2 = p2.y;
		const dx = x2 - x1;
		const dy = y2 - y1;
		const lenSq = dx * dx + dy * dy;
		if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
		let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
		t = Math.max(0, Math.min(1, t));
		const closestX = x1 + t * dx;
		const closestY = y1 + t * dy;
		return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
	}, [activeSketch]);
	return {
		getDistanceToLine,
		applyConstraint: useCallback(async (type, value) => {
			if (selectedPrimitives.length === 0 || !activeSketch) {
				console.warn("No primitives selected for constraint");
				return;
			}
			pushSketchUndo();
			const getPrimitive = (id) => activeSketch.primitives.find((p) => p.id === id);
			let lastResult = { status: "applied" };
			if ([
				"horizontal",
				"vertical",
				"radius",
				"diameter"
			].includes(type) && selectedPrimitives.length > 1) {
				debugLog(`Applying ${type} constraint to ${selectedPrimitives.length} primitives`);
				for (const primitiveId of selectedPrimitives) {
					const constraint = makeSketchConstraint(generateId("const"), type, [primitiveId], value);
					debugLog("Applying constraint:", constraint);
					const result = await addConstraintAndSolve(constraint);
					if (result.status !== "applied") lastResult = result;
				}
			} else if (type === "pointOnLine" && selectedPrimitives.length > 2) {
				let pointOrCircleId = null;
				const lineIds = [];
				for (const id of selectedPrimitives) {
					const prim = getPrimitive(id);
					if (!prim) continue;
					if (isSketchPoint(prim) || isSketchCircle(prim)) {
						if (!pointOrCircleId) pointOrCircleId = id;
					} else if (isSketchLine(prim)) lineIds.push(id);
				}
				if (pointOrCircleId && lineIds.length > 0) {
					const pointOrCircle = getPrimitive(pointOrCircleId);
					let px = 0, py = 0;
					if (pointOrCircle) {
						if (isSketchPoint(pointOrCircle)) {
							px = pointOrCircle.x;
							py = pointOrCircle.y;
						} else if (isSketchCircle(pointOrCircle)) {
							const centerPoint = activeSketch.primitives.find((p) => p.id === pointOrCircle.centerId);
							if (centerPoint && isSketchPoint(centerPoint)) {
								px = centerPoint.x;
								py = centerPoint.y;
							}
						}
					}
					let closestLineId = lineIds[0];
					let minDistance = Infinity;
					for (const lineId of lineIds) {
						const distance = getDistanceToLine(px, py, lineId);
						if (distance < minDistance) {
							minDistance = distance;
							closestLineId = lineId;
						}
					}
					debugLog(`pointOnLine: selected closest line ${closestLineId} at distance ${minDistance.toFixed(4)}`);
					const constraint = makeSketchConstraint(generateId("const"), type, [pointOrCircleId, closestLineId], value);
					debugLog("Applying pointOnLine constraint:", constraint);
					lastResult = await addConstraintAndSolve(constraint);
				} else console.warn("Could not find point/circle and line for pointOnLine constraint");
			} else if (type === "pointOnCircle" && selectedPrimitives.length > 2) {
				let pointId = null;
				let circleId = null;
				for (const id of selectedPrimitives) {
					const prim = getPrimitive(id);
					if (!prim) continue;
					if (isSketchPoint(prim)) {
						if (!pointId) pointId = id;
					} else if (isSketchCircle(prim) || isSketchArc(prim)) {
						if (!circleId) circleId = id;
					}
				}
				if (pointId && circleId) {
					const constraint = makeSketchConstraint(generateId("const"), type, [pointId, circleId], value);
					debugLog("Applying pointOnCircle constraint:", constraint);
					lastResult = await addConstraintAndSolve(constraint);
				} else console.warn("Could not find point and circle for pointOnCircle constraint");
			} else if (type === "tangent" && selectedPrimitives.length > 2) {
				let lineId = null;
				let circleId = null;
				for (const id of selectedPrimitives) {
					const prim = getPrimitive(id);
					if (!prim) continue;
					if (isSketchLine(prim)) {
						if (!lineId) lineId = id;
					} else if (isSketchCircle(prim)) {
						if (!circleId) circleId = id;
					}
				}
				if (lineId && circleId) {
					const constraint = makeSketchConstraint(generateId("const"), type, [lineId, circleId], value);
					debugLog("Applying tangent constraint:", constraint);
					lastResult = await addConstraintAndSolve(constraint);
				} else console.warn("Could not find line and circle for tangent constraint");
			} else {
				const constraint = makeSketchConstraint(generateId("const"), type, [...selectedPrimitives], value);
				debugLog("Applying constraint:", constraint);
				lastResult = await addConstraintAndSolve(constraint);
			}
			showConstraintFeedback(lastResult.status);
			clearSelection();
		}, [
			selectedPrimitives,
			activeSketch,
			generateId,
			addConstraintAndSolve,
			clearSelection,
			pushSketchUndo,
			showConstraintFeedback,
			getDistanceToLine
		]),
		getCurrentValueForConstraint: useCallback((type) => {
			const sketch = activeSketchRef.current;
			if (!sketch) return void 0;
			const ids = contextMenu.primitiveIds;
			if (ids.length === 0) return void 0;
			if (type === "distance") {
				if (ids.length === 1 && ids[0]) {
					const line = findSketchLine(sketch.primitives, ids[0]);
					if (line) {
						const p1 = findSketchPoint(sketch.primitives, line.p1Id);
						const p2 = findSketchPoint(sketch.primitives, line.p2Id);
						if (p1 && p2) return Math.hypot(p2.x - p1.x, p2.y - p1.y);
					}
				} else if (ids.length === 2 && ids[0] && ids[1]) {
					const pt1 = findSketchPoint(sketch.primitives, ids[0]);
					const pt2 = findSketchPoint(sketch.primitives, ids[1]);
					if (pt1 && pt2) return Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);
				}
			} else if (type === "radius") {
				if (ids.length === 1) {
					const circle = sketch.primitives.find((p) => p.id === ids[0] && (isSketchCircle(p) || isSketchArc(p)));
					if (circle) return circle.radius;
				}
			}
		}, [contextMenu.primitiveIds, activeSketchRef]),
		handleConstraintPreviewChange: useCallback((type, value, overridePrimitiveIds) => {
			if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
			previewDebounceRef.current = setTimeout(() => {
				if (!previewConstraintIdRef.current) previewConstraintIdRef.current = generateId("const");
				isPreviewingRef.current = true;
				previewConstraint({
					id: previewConstraintIdRef.current,
					type,
					primitiveIds: overridePrimitiveIds ?? [...contextMenu.primitiveIds],
					value,
					driving: true
				});
			}, 150);
		}, [
			contextMenu.primitiveIds,
			generateId,
			previewConstraint,
			previewDebounceRef,
			previewConstraintIdRef,
			isPreviewingRef
		]),
		handleConstraintPreviewCancel: useCallback(() => {
			if (previewDebounceRef.current) {
				clearTimeout(previewDebounceRef.current);
				previewDebounceRef.current = null;
			}
			if (isPreviewingRef.current) {
				cancelConstraintPreview();
				isPreviewingRef.current = false;
				previewConstraintIdRef.current = null;
			}
		}, [
			cancelConstraintPreview,
			previewDebounceRef,
			isPreviewingRef,
			previewConstraintIdRef
		]),
		deleteConstraint: useCallback((constraintId) => {
			pushSketchUndo();
			removeConstraint(constraintId);
			solveSketch();
			setSelectedConstraintId(null);
			closeContextMenu();
		}, [
			pushSketchUndo,
			removeConstraint,
			solveSketch,
			closeContextMenu,
			setSelectedConstraintId
		]),
		toggleFixPoint: useCallback(() => {
			if (!activeSketch || selectedPrimitives.length === 0) return;
			pushSketchUndo();
			for (const primId of selectedPrimitives) {
				const prim = activeSketch.primitives.find((p) => p.id === primId);
				if (prim && isSketchPoint(prim)) updatePrimitive(primId, { fixed: !prim.fixed });
			}
			solveSketch();
		}, [
			activeSketch,
			selectedPrimitives,
			pushSketchUndo,
			updatePrimitive,
			solveSketch
		]),
		deleteSelectedPrimitives: useCallback(() => {
			if (!activeSketch || selectedPrimitives.length === 0) return;
			pushSketchUndo();
			for (const primId of selectedPrimitives) removePrimitive(primId);
			clearSelection();
			solveSketch();
		}, [
			activeSketch,
			selectedPrimitives,
			pushSketchUndo,
			removePrimitive,
			solveSketch,
			clearSelection
		]),
		applyConstraintToContextMenuPrimitives: useCallback(async (type, value) => {
			if (contextMenu.primitiveIds.length === 0) {
				console.warn("No primitives in context menu for constraint");
				closeContextMenu();
				return;
			}
			if (isPreviewingRef.current) {
				if (previewDebounceRef.current) {
					clearTimeout(previewDebounceRef.current);
					previewDebounceRef.current = null;
				}
				commitConstraintPreview();
				isPreviewingRef.current = false;
				previewConstraintIdRef.current = null;
				showConstraintFeedback("applied");
				setContextMenu({
					visible: false,
					x: 0,
					y: 0,
					primitiveIds: [],
					primitiveTypes: []
				});
				return;
			}
			pushSketchUndo();
			let lastResult = { status: "applied" };
			if ([
				"horizontal",
				"vertical",
				"radius",
				"diameter"
			].includes(type) && contextMenu.primitiveIds.length > 1) {
				debugLog(`Applying ${type} constraint to ${contextMenu.primitiveIds.length} primitives from context menu`);
				for (const primitiveId of contextMenu.primitiveIds) {
					const result = await addConstraintAndSolve(makeSketchConstraint(generateId("const"), type, [primitiveId], value));
					if (result.status !== "applied") lastResult = result;
				}
			} else {
				const constraint = makeSketchConstraint(generateId("const"), type, [...contextMenu.primitiveIds], value);
				debugLog("Applying constraint from context menu:", constraint);
				lastResult = await addConstraintAndSolve(constraint);
			}
			showConstraintFeedback(lastResult.status);
			closeContextMenu();
		}, [
			contextMenu.primitiveIds,
			generateId,
			addConstraintAndSolve,
			closeContextMenu,
			pushSketchUndo,
			showConstraintFeedback,
			commitConstraintPreview,
			setContextMenu,
			isPreviewingRef,
			previewDebounceRef,
			previewConstraintIdRef
		])
	};
}
//#endregion
//#region src/hooks/sketch/hooks/useSketchRender.ts
/**
* Sketch primitive render effect, rebuilds Three.js sketch objects whenever
* the sketch state changes. Owns the visible sketch: points, lines, circles,
* arcs, constraint glyphs, dimension lines, leader lines, and closed-profile
* fill geometry.
*
* Sets `sketchTo3DRef.current` on every run so drawing handlers and inference
* render can project sketch-2D coords to 3D world coords on the active plane.
*
* Stores all created objects in `sketchObjectsRef.current` for picking and
* cleanup; the array is mutated by selection's glyph drag commit too.
*/
function useSketchRender({ sketchObjectsRef, sketchTo3DRef, selectedPrimitives, sketchSubMode, selectedConstraintId }) {
	const { activeSketch } = useCadCore();
	const { scene, camera, renderer, sceneReady, requestRender } = useCadVisualizer();
	useEffect(() => {
		const cleanupObjects = () => {
			sketchObjectsRef.current.forEach((obj) => {
				scene?.remove(obj);
				try {
					if (obj instanceof Line2 || obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
						obj.geometry.dispose();
						obj.material.dispose();
					} else if (obj instanceof THREE.Sprite) {
						obj.material.map?.dispose();
						obj.material.dispose();
					}
				} catch {}
			});
			sketchObjectsRef.current = [];
			requestRender();
		};
		if (!scene || !sceneReady || !activeSketch) {
			cleanupObjects();
			return;
		}
		cleanupObjects();
		const newObjects = [];
		const getColor = (primitiveId) => {
			const construction = isConstructionPrimitive(activeSketch.primitives.find((p) => p.id === primitiveId));
			if (selectedPrimitives.includes(primitiveId)) return construction ? SKETCH.constructionSelected : COLORS.selected;
			if (construction) return SKETCH.construction;
			return activeSketch.status === "fully_constrained" ? COLORS.constrained : activeSketch.status === "overconstrained" ? COLORS.overconstrained : COLORS.underconstrained;
		};
		const isConstruction = (primitiveId) => isConstructionPrimitive(activeSketch.primitives.find((p) => p.id === primitiveId));
		const sketchTo3D = (x, y, zOffset = 0) => {
			const plane = activeSketch.plane;
			return new THREE.Vector3().copy(plane.origin).addScaledVector(plane.xAxis, x).addScaledVector(plane.yAxis, y).addScaledVector(plane.normal, zOffset);
		};
		sketchTo3DRef.current = sketchTo3D;
		const pointMap = /* @__PURE__ */ new Map();
		const AXIS_VIS_LEN = 1e4;
		for (const primitive of activeSketch.primitives) {
			const isSelected = selectedPrimitives.includes(primitive.id);
			const color = getColor(primitive.id);
			const constructionFlag = isConstruction(primitive.id);
			const isOrigin = !!primitive.origin;
			if (isSketchPoint(primitive)) {
				pointMap.set(primitive.id, {
					x: primitive.x,
					y: primitive.y
				});
				if (isOrigin && (primitive.x !== 0 || primitive.y !== 0)) continue;
				const isTrimMode = sketchSubMode === "trim";
				const size = isTrimMode ? .04 : isSelected ? .1 : .07;
				const geometry = new THREE.CircleGeometry(size, 16);
				const pointColor = isSelected ? COLORS.selectedPoint : isOrigin ? SKETCH.originPoint : primitive.fixed ? SKETCH.fixed : COLORS.point;
				const material = new THREE.MeshBasicMaterial({
					color: pointColor,
					depthTest: false,
					...isTrimMode ? {
						transparent: true,
						opacity: .25
					} : {}
				});
				const mesh = new THREE.Mesh(geometry, material);
				const pos = sketchTo3D(primitive.x, primitive.y, .1);
				mesh.position.copy(pos);
				mesh.renderOrder = 999;
				mesh.userData = {
					primitiveId: primitive.id,
					type: "point",
					isSketchPrimitive: true
				};
				scene.add(mesh);
				newObjects.push(mesh);
			} else if (isSketchLine(primitive)) {
				const p1Prim = findSketchPoint(activeSketch.primitives, primitive.p1Id);
				const p2Prim = findSketchPoint(activeSketch.primitives, primitive.p2Id);
				if (!p1Prim || !p2Prim) {
					console.warn("Could not find points for line:", primitive.p1Id, primitive.p2Id);
					continue;
				}
				let start3D;
				let end3D;
				let lineColor;
				let lineWidth;
				let dashed;
				if (isOrigin) {
					const dx = p2Prim.x - p1Prim.x;
					const dy = p2Prim.y - p1Prim.y;
					const len = Math.hypot(dx, dy) || 1;
					const ux = dx / len;
					const uy = dy / len;
					start3D = sketchTo3D(-ux * AXIS_VIS_LEN, -uy * AXIS_VIS_LEN, .02);
					end3D = sketchTo3D(ux * AXIS_VIS_LEN, uy * AXIS_VIS_LEN, .02);
					lineColor = isSelected ? COLORS.selectedLine : Math.abs(uy) < Math.abs(ux) ? SKETCH.xAxisLine : SKETCH.yAxisLine;
					lineWidth = isSelected ? 2.5 : 1.2;
					dashed = false;
				} else {
					start3D = sketchTo3D(p1Prim.x, p1Prim.y, .05);
					end3D = sketchTo3D(p2Prim.x, p2Prim.y, .05);
					lineColor = isSelected ? COLORS.selectedLine : color;
					lineWidth = isSelected ? 3 : 1.5;
					dashed = constructionFlag;
				}
				const line = createLine2FromPoints([
					start3D.x,
					start3D.y,
					start3D.z,
					end3D.x,
					end3D.y,
					end3D.z
				], lineColor, lineWidth, dashed);
				line.renderOrder = isOrigin ? 998 : 999;
				line.userData = {
					primitiveId: primitive.id,
					type: "line",
					isSketchPrimitive: true
				};
				scene.add(line);
				newObjects.push(line);
			} else if (isSketchCircle(primitive)) {
				const centerPt = findSketchPoint(activeSketch.primitives, primitive.centerId);
				if (centerPt) {
					const segments = getAdaptiveSegments(camera, renderer, primitive.radius);
					const positions = [];
					for (let i = 0; i <= segments; i++) {
						const angle = i / segments * Math.PI * 2;
						const pt = sketchTo3D(centerPt.x + Math.cos(angle) * primitive.radius, centerPt.y + Math.sin(angle) * primitive.radius, SKETCH_PLANE_Z_LIFT_MM);
						positions.push(pt.x, pt.y, pt.z);
					}
					const line = createLine2FromPoints(positions, color, isSelected ? 3 : 1.5, constructionFlag);
					line.renderOrder = 999;
					line.userData = {
						primitiveId: primitive.id,
						type: "circle",
						isSketchPrimitive: true
					};
					scene.add(line);
					newObjects.push(line);
				} else console.warn("Could not find center for circle:", primitive.centerId);
			} else if (isSketchArc(primitive)) {
				const centerPrim2D = findSketchPoint(activeSketch.primitives, primitive.centerId);
				const startPrim2D = findSketchPoint(activeSketch.primitives, primitive.startId);
				const endPrim2D = findSketchPoint(activeSketch.primitives, primitive.endId);
				if (centerPrim2D && startPrim2D && endPrim2D) {
					const radius = primitive.radius;
					const startAngle = Math.atan2(startPrim2D.y - centerPrim2D.y, startPrim2D.x - centerPrim2D.x);
					const angleDiff = Math.atan2(endPrim2D.y - centerPrim2D.y, endPrim2D.x - centerPrim2D.x) - startAngle;
					const normalizedDiff = angleDiff > 0 ? angleDiff : angleDiff + Math.PI * 2;
					const segments = getAdaptiveSegments(camera, renderer, radius, normalizedDiff);
					const positions = [];
					for (let i = 0; i <= segments; i++) {
						const currentAngle = startAngle + normalizedDiff * (i / segments);
						const pt = sketchTo3D(centerPrim2D.x + Math.cos(currentAngle) * radius, centerPrim2D.y + Math.sin(currentAngle) * radius, .05);
						positions.push(pt.x, pt.y, pt.z);
					}
					const line = createLine2FromPoints(positions, color, isSelected ? 3 : 1.5, constructionFlag);
					line.userData = {
						primitiveId: primitive.id,
						type: "arc",
						isSketchPrimitive: true
					};
					scene.add(line);
					newObjects.push(line);
				}
			}
		}
		const constraintGlyphMap = {
			horizontal: "H",
			vertical: "V",
			perpendicular: "⟂",
			parallel: "//",
			equal: "=",
			tangent: "T",
			coincident: "●",
			concentric: "◎",
			pointOnLine: "●",
			pointOnCircle: "●",
			distance: "D",
			distanceX: "Dx",
			distanceY: "Dy",
			angle: "∠",
			radius: "R",
			diameter: "⌀"
		};
		const glyphCountPerPrimitive = /* @__PURE__ */ new Map();
		for (const constraint of activeSketch.constraints) {
			if (isDimensionalConstraint(constraint)) {
				const firstPrim = constraint.primitiveIds[0] ? activeSketch.primitives.find((p) => p.id === constraint.primitiveIds[0]) : null;
				if (constraint.type === "distance" && firstPrim && isSketchLine(firstPrim) || constraint.type === "radius" || constraint.type === "diameter") continue;
			}
			const glyphText = constraintGlyphMap[constraint.type] || "?";
			const firstPrimId = constraint.primitiveIds[0];
			if (!firstPrimId) continue;
			const prim = activeSketch.primitives.find((p) => p.id === firstPrimId);
			if (!prim) continue;
			let geometryAnchor2D = null;
			let perpOffset2D = {
				x: 0,
				y: 0
			};
			if (isSketchLine(prim)) {
				const pt1 = pointMap.get(prim.p1Id);
				const pt2 = pointMap.get(prim.p2Id);
				if (pt1 && pt2) {
					geometryAnchor2D = {
						x: (pt1.x + pt2.x) / 2,
						y: (pt1.y + pt2.y) / 2
					};
					const dx = pt2.x - pt1.x;
					const dy = pt2.y - pt1.y;
					const len = Math.sqrt(dx * dx + dy * dy);
					if (len > 0) perpOffset2D = {
						x: -dy / len * .25,
						y: dx / len * .25
					};
				}
			} else if (isSketchCircle(prim)) {
				const cp = pointMap.get(prim.centerId);
				if (cp) {
					geometryAnchor2D = {
						x: cp.x,
						y: cp.y
					};
					perpOffset2D = {
						x: prim.radius * .7,
						y: prim.radius * .7
					};
				}
			} else if (isSketchPoint(prim)) {
				geometryAnchor2D = {
					x: prim.x,
					y: prim.y
				};
				perpOffset2D = {
					x: .2,
					y: .2
				};
			}
			if (geometryAnchor2D) {
				const count = glyphCountPerPrimitive.get(firstPrimId) || 0;
				glyphCountPerPrimitive.set(firstPrimId, count + 1);
				const defaultLabel2D = {
					x: geometryAnchor2D.x + perpOffset2D.x,
					y: geometryAnchor2D.y + perpOffset2D.y + count * .35
				};
				const labelOff = constraint.labelOffset;
				const glyphPos = sketchTo3D(defaultLabel2D.x + (labelOff?.x || 0), defaultLabel2D.y + (labelOff?.y || 0), .15);
				const sprite = createConstraintGlyph(glyphText, glyphPos, constraint.id === selectedConstraintId);
				sprite.userData.constraintId = constraint.id;
				sprite.userData.isConstraintGlyph = true;
				sprite.userData.anchor2D = defaultLabel2D;
				sprite.userData.geometryAnchor2D = geometryAnchor2D;
				scene.add(sprite);
				newObjects.push(sprite);
				if (labelOff && (Math.abs(labelOff.x) > .01 || Math.abs(labelOff.y) > .01)) {
					const geoPos = sketchTo3D(geometryAnchor2D.x, geometryAnchor2D.y, .15);
					const leaderLine = createLine2FromPoints([
						geoPos.x,
						geoPos.y,
						geoPos.z,
						glyphPos.x,
						glyphPos.y,
						glyphPos.z
					], SKETCH.constraintGlyph, .5);
					leaderLine.renderOrder = 999;
					scene.add(leaderLine);
					newObjects.push(leaderLine);
				}
			}
		}
		for (const constraint of activeSketch.constraints) {
			if (!isDimensionalConstraint(constraint)) continue;
			const firstPrimId = constraint.primitiveIds[0];
			const prim = activeSketch.primitives.find((p) => p.id === firstPrimId);
			if (!prim) continue;
			if (constraint.type === "distance" && isSketchLine(prim)) {
				const pt1 = pointMap.get(prim.p1Id);
				const pt2 = pointMap.get(prim.p2Id);
				if (!pt1 || !pt2) continue;
				const dx = pt2.x - pt1.x;
				const dy = pt2.y - pt1.y;
				const len = Math.sqrt(dx * dx + dy * dy);
				if (len < .01) continue;
				const perpX = -dy / len;
				const perpY = dx / len;
				const offset = .5;
				const ext1Start = sketchTo3D(pt1.x, pt1.y, .12);
				const ext1End = sketchTo3D(pt1.x + perpX * offset, pt1.y + perpY * offset, .12);
				const ext2Start = sketchTo3D(pt2.x, pt2.y, .12);
				const ext2End = sketchTo3D(pt2.x + perpX * offset, pt2.y + perpY * offset, .12);
				const dimColor = SKETCH.constraintGlyph;
				const ext1 = createLine2FromPoints([
					ext1Start.x,
					ext1Start.y,
					ext1Start.z,
					ext1End.x,
					ext1End.y,
					ext1End.z
				], dimColor, .8);
				ext1.renderOrder = 1e3;
				scene.add(ext1);
				newObjects.push(ext1);
				const ext2 = createLine2FromPoints([
					ext2Start.x,
					ext2Start.y,
					ext2Start.z,
					ext2End.x,
					ext2End.y,
					ext2End.z
				], dimColor, .8);
				ext2.renderOrder = 1e3;
				scene.add(ext2);
				newObjects.push(ext2);
				const dimLine = createLine2FromPoints([
					ext1End.x,
					ext1End.y,
					ext1End.z,
					ext2End.x,
					ext2End.y,
					ext2End.z
				], dimColor, 1);
				dimLine.renderOrder = 1e3;
				scene.add(dimLine);
				newObjects.push(dimLine);
				const arrowSize = .12;
				const dirX = dx / len;
				const dirY = dy / len;
				for (const [base, sign] of [[ext1End, 1], [ext2End, -1]]) {
					const tipX = base.x + sign * dirX * arrowSize;
					const tipY = base.y + sign * dirY * arrowSize;
					const wing1X = base.x - sign * dirX * .02 + perpX * arrowSize * .3;
					const wing1Y = base.y - sign * dirY * .02 + perpY * arrowSize * .3;
					const wing2X = base.x - sign * dirX * .02 - perpX * arrowSize * .3;
					const wing2Y = base.y - sign * dirY * .02 - perpY * arrowSize * .3;
					const arrowShape = new THREE.Shape();
					arrowShape.moveTo(tipX, tipY);
					arrowShape.lineTo(wing1X, wing1Y);
					arrowShape.lineTo(wing2X, wing2Y);
					arrowShape.closePath();
					const arrowGeo = new THREE.ShapeGeometry(arrowShape);
					const arrowMat = new THREE.MeshBasicMaterial({
						color: dimColor,
						depthTest: false
					});
					const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
					arrowMesh.renderOrder = 1001;
					scene.add(arrowMesh);
					newObjects.push(arrowMesh);
				}
				const dimDefaultX = (pt1.x + pt2.x) / 2 + perpX * offset;
				const dimDefaultY = (pt1.y + pt2.y) / 2 + perpY * offset + .2;
				const dimDefault2D = {
					x: dimDefaultX,
					y: dimDefaultY
				};
				const dimGeoAnchor2D = {
					x: (pt1.x + pt2.x) / 2,
					y: (pt1.y + pt2.y) / 2
				};
				const dimLabelOff = constraint.labelOffset;
				const dimLabelPos = sketchTo3D(dimDefaultX + (dimLabelOff?.x || 0), dimDefaultY + (dimLabelOff?.y || 0), .15);
				const valueSprite = createConstraintGlyph(constraint.value.toFixed(2), dimLabelPos, constraint.id === selectedConstraintId);
				valueSprite.userData.constraintId = constraint.id;
				valueSprite.userData.isConstraintGlyph = true;
				valueSprite.userData.anchor2D = dimDefault2D;
				valueSprite.userData.geometryAnchor2D = dimGeoAnchor2D;
				valueSprite.scale.set(.4, .4, .4);
				scene.add(valueSprite);
				newObjects.push(valueSprite);
				if (dimLabelOff && (Math.abs(dimLabelOff.x) > .01 || Math.abs(dimLabelOff.y) > .01)) {
					const geoPos = sketchTo3D(dimGeoAnchor2D.x, dimGeoAnchor2D.y, .15);
					const dimLeader = createLine2FromPoints([
						geoPos.x,
						geoPos.y,
						geoPos.z,
						dimLabelPos.x,
						dimLabelPos.y,
						dimLabelPos.z
					], dimColor, .5);
					dimLeader.renderOrder = 999;
					scene.add(dimLeader);
					newObjects.push(dimLeader);
				}
			} else if ((constraint.type === "radius" || constraint.type === "diameter") && isSketchCircle(prim)) {
				const cp = pointMap.get(prim.centerId);
				if (!cp) continue;
				const edgeX = cp.x + prim.radius;
				const edgeY = cp.y;
				const dimColor = SKETCH.constraintGlyph;
				const leaderStart = sketchTo3D(cp.x, cp.y, .12);
				const leaderEnd = sketchTo3D(edgeX, edgeY, .12);
				const leader = createLine2FromPoints([
					leaderStart.x,
					leaderStart.y,
					leaderStart.z,
					leaderEnd.x,
					leaderEnd.y,
					leaderEnd.z
				], dimColor, 1);
				leader.renderOrder = 1e3;
				scene.add(leader);
				newObjects.push(leader);
				const radDefault2D = {
					x: (cp.x + edgeX) / 2,
					y: cp.y + .25
				};
				const radGeoAnchor2D = {
					x: cp.x,
					y: cp.y
				};
				const radLabelOff = constraint.labelOffset;
				const labelPos = sketchTo3D(radDefault2D.x + (radLabelOff?.x || 0), radDefault2D.y + (radLabelOff?.y || 0), .15);
				const prefix = constraint.type === "radius" ? "R" : "⌀";
				const isRadDimSelected = constraint.id === selectedConstraintId;
				const valueSprite = createConstraintGlyph(`${prefix}${constraint.value.toFixed(2)}`, labelPos, isRadDimSelected);
				valueSprite.userData.constraintId = constraint.id;
				valueSprite.userData.isConstraintGlyph = true;
				valueSprite.userData.anchor2D = radDefault2D;
				valueSprite.userData.geometryAnchor2D = radGeoAnchor2D;
				valueSprite.scale.set(.4, .4, .4);
				scene.add(valueSprite);
				newObjects.push(valueSprite);
				if (radLabelOff && (Math.abs(radLabelOff.x) > .01 || Math.abs(radLabelOff.y) > .01)) {
					const geoPos = sketchTo3D(radGeoAnchor2D.x, radGeoAnchor2D.y, .15);
					const radLeader = createLine2FromPoints([
						geoPos.x,
						geoPos.y,
						geoPos.z,
						labelPos.x,
						labelPos.y,
						labelPos.z
					], dimColor, .5);
					radLeader.renderOrder = 999;
					scene.add(radLeader);
					newObjects.push(radLeader);
				}
			}
		}
		const edges = [];
		for (const prim of activeSketch.primitives) if (isSketchLine(prim) && !prim.construction && !prim.origin) {
			const pt1 = pointMap.get(prim.p1Id);
			const pt2 = pointMap.get(prim.p2Id);
			if (pt1 && pt2) edges.push({
				p1: prim.p1Id,
				p2: prim.p2Id,
				p1Coords: pt1,
				p2Coords: pt2
			});
		}
		if (edges.length >= 3) {
			const adjacency = /* @__PURE__ */ new Map();
			for (const e of edges) {
				if (!adjacency.has(e.p1)) adjacency.set(e.p1, []);
				if (!adjacency.has(e.p2)) adjacency.set(e.p2, []);
				adjacency.get(e.p1).push({
					to: e.p2,
					coords: e.p2Coords
				});
				adjacency.get(e.p2).push({
					to: e.p1,
					coords: e.p1Coords
				});
			}
			const foundCycles = [];
			const cycleSignatures = /* @__PURE__ */ new Set();
			for (const startNode of adjacency.keys()) {
				const stack = [{
					node: startNode,
					path: [startNode]
				}];
				while (stack.length > 0) {
					const { node, path } = stack.pop();
					if (path.length > 10) continue;
					const neighbors = adjacency.get(node) || [];
					for (const { to: neighbor } of neighbors) if (neighbor === startNode && path.length >= 3) {
						const sorted = [...path].sort().join(",");
						if (!cycleSignatures.has(sorted)) {
							cycleSignatures.add(sorted);
							foundCycles.push([...path]);
						}
					} else if (!path.includes(neighbor)) stack.push({
						node: neighbor,
						path: [...path, neighbor]
					});
				}
			}
			for (const cycle of foundCycles) {
				const shapePoints = [];
				for (const ptId of cycle) {
					const coords = pointMap.get(ptId);
					if (coords) shapePoints.push(new THREE.Vector2(coords.x, coords.y));
				}
				if (shapePoints.length >= 3) {
					let area = 0;
					for (let i = 0; i < shapePoints.length; i++) {
						const j = (i + 1) % shapePoints.length;
						area += shapePoints[i].x * shapePoints[j].y;
						area -= shapePoints[j].x * shapePoints[i].y;
					}
					area = Math.abs(area) / 2;
					if (area < .01) continue;
					const shape = new THREE.Shape(shapePoints);
					const shapeGeometry = new THREE.ShapeGeometry(shape);
					const shapeMaterial = new THREE.MeshBasicMaterial({
						color: SKETCH.profileFill,
						transparent: true,
						opacity: SKETCH.profileFillOpacity,
						depthTest: false,
						side: THREE.DoubleSide
					});
					const shapeMesh = new THREE.Mesh(shapeGeometry, shapeMaterial);
					const quat = new THREE.Quaternion();
					quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), activeSketch.plane.normal);
					shapeMesh.quaternion.copy(quat);
					shapeMesh.position.copy(activeSketch.plane.origin);
					shapeMesh.renderOrder = 997;
					scene.add(shapeMesh);
					newObjects.push(shapeMesh);
				}
			}
		}
		for (const obj of newObjects) obj.userData.isSketchObject = true;
		sketchObjectsRef.current = newObjects;
		requestRender();
		return cleanupObjects;
	}, [
		activeSketch,
		scene,
		sceneReady,
		selectedPrimitives,
		sketchSubMode,
		selectedConstraintId,
		camera,
		renderer,
		sketchObjectsRef,
		sketchTo3DRef,
		requestRender
	]);
}
//#endregion
//#region src/hooks/sketch/hooks/useSketchInputHandlers.ts
/**
* Sketch input layer: routes mouse events through the right sub-mode handler
* (drawing/select/trim/extend), wires inference snapping + guidelines, and
* handles all keyboard shortcuts (tool switches, Escape, Delete, X for
* construction toggle).
*
* Uses the shared `createModeInputHandlers` factory for keyboard centralization
* and continuous pointer tracking via `onPointerMove`. Mouse events are
* delegated to the existing per-sub-mode dispatcher; right-click bypasses the
* factory's LMB gate. Drag-protocol semantics don't fit sketch, sketch is in
* continuous-pointer-tracking mode, not drag mode.
*
* Also owns two lifecycle effects: mode-change clear-selection and
* sub-mode-change clear-selection. (Line2 resolution sync is centralised in
* `useSceneAndRenderer`'s ResizeObserver, it walks the whole scene.)
*/
function useSketchInputHandlers(params) {
	const { mode, sketchSubMode, setSketchSubMode, activeSketch, ctrlHeldRef, lastSnapRef, handleLineDraw, handleRectangleDraw, handleCircleDraw, handleArcDraw, handlePointDraw, handleSelectMode, handleTrimMode, handleExtendMode, cancelCurrentOperation, isDrawingActive, getChainStartPoint, isSelectingPlane, cancelPlaneSelection, isGlyphDraggingActiveRef, renderInferencePoint, renderGuidelines, cleanupInferenceObjects, findInferencePoints, findNearestSnap, findGuidelines, setCurrentInferencePoint, setGuidelines, selectedPrimitives, clearSelection, selectedConstraintId, setSelectedConstraintId, pushSketchUndo, removeConstraint, removePrimitive, solveSketch, updatePrimitive } = params;
	const { getMouseIntersection, gridSpacing, gridSnapEnabled, navToolActiveRef } = useCadVisualizer();
	const { raycasterFromEvent } = useRaycastToObjects();
	const { INFERENCE_SNAP_DISTANCE, ALIGNMENT_TOLERANCE } = SKETCH_CONFIG;
	const isApplyingRef = useRef(false);
	const holdRefs = useModeInputHoldRefs();
	const sketchSubModeRef = useRef(sketchSubMode);
	sketchSubModeRef.current = sketchSubMode;
	const isSelectingPlaneRef = useRef(isSelectingPlane);
	isSelectingPlaneRef.current = isSelectingPlane;
	const activeSketchRef = useRef(activeSketch);
	activeSketchRef.current = activeSketch;
	const selectedPrimitivesRef = useRef(selectedPrimitives);
	selectedPrimitivesRef.current = selectedPrimitives;
	const selectedConstraintIdRef = useRef(selectedConstraintId);
	selectedConstraintIdRef.current = selectedConstraintId;
	/**
	* Project the mouse event to the active sketch plane in 2D, with grid snap +
	* inference snap (suppressed when Ctrl held or in trim/extend modes).
	* Used by both `onPickStart` (mousedown) and `onPointerMove` so they apply
	* identical snapping logic.
	*/
	const projectAndSnap = useCallback((event, isMouseDown) => {
		const subMode = sketchSubModeRef.current;
		const point3D = getMouseIntersection(event);
		if (!point3D) return {
			point: null,
			subMode
		};
		const sketch = activeSketchRef.current;
		let point = sketch ? worldToSketch2D(point3D, sketch.plane) : point3D.clone();
		point = snapToGrid(point, gridSpacing, gridSnapEnabled);
		const skipInference = ctrlHeldRef.current || subMode === "trim" || subMode === "extend";
		if (sketch && !isMouseDown && !skipInference) {
			const inferencePoints = findInferencePoints(sketch);
			const nearestSnap = findNearestSnap(point, inferencePoints, INFERENCE_SNAP_DISTANCE);
			if (nearestSnap) {
				point = nearestSnap.position.clone();
				setCurrentInferencePoint(nearestSnap);
				renderInferencePoint(nearestSnap);
			} else {
				setCurrentInferencePoint(null);
				cleanupInferenceObjects();
			}
			const currentGuidelines = findGuidelines(point, sketch, getChainStartPoint(), ALIGNMENT_TOLERANCE);
			setGuidelines(currentGuidelines);
			renderGuidelines(currentGuidelines);
		}
		if (sketch && !isMouseDown && skipInference && ctrlHeldRef.current) {
			setCurrentInferencePoint(null);
			cleanupInferenceObjects();
			setGuidelines([]);
			renderGuidelines([]);
		}
		if (sketch && isMouseDown && !skipInference) {
			const inferencePoints = findInferencePoints(sketch);
			const nearestSnap = findNearestSnap(point, inferencePoints, INFERENCE_SNAP_DISTANCE);
			if (nearestSnap) {
				point = nearestSnap.position.clone();
				lastSnapRef.current = nearestSnap;
			} else lastSnapRef.current = null;
		}
		return {
			point,
			subMode
		};
	}, [
		getMouseIntersection,
		gridSpacing,
		gridSnapEnabled,
		ctrlHeldRef,
		activeSketchRef,
		sketchSubModeRef,
		lastSnapRef,
		findInferencePoints,
		findNearestSnap,
		findGuidelines,
		setCurrentInferencePoint,
		setGuidelines,
		renderInferencePoint,
		renderGuidelines,
		cleanupInferenceObjects,
		getChainStartPoint,
		INFERENCE_SNAP_DISTANCE,
		ALIGNMENT_TOLERANCE
	]);
	const dispatchPointerEvent = useCallback((event, isMouseDown) => {
		const { point, subMode } = projectAndSnap(event, isMouseDown);
		if (!point) return;
		switch (subMode) {
			case "line":
				handleLineDraw(event, point);
				break;
			case "rectangle":
				handleRectangleDraw(event, point);
				break;
			case "circle":
				handleCircleDraw(event, point);
				break;
			case "arc":
				handleArcDraw(event, point);
				break;
			case "point":
				handlePointDraw(event, point);
				break;
			case "select":
			case "dimension":
				handleSelectMode(event, false);
				break;
			case "trim":
				handleTrimMode(event, point);
				break;
			case "extend":
				handleExtendMode(event, point);
				break;
		}
	}, [
		projectAndSnap,
		handleLineDraw,
		handleRectangleDraw,
		handleCircleDraw,
		handleArcDraw,
		handlePointDraw,
		handleSelectMode,
		handleTrimMode,
		handleExtendMode
	]);
	const handlers = useMemo(() => createModeInputHandlers({
		pickTargets: () => {
			if (mode !== "sketch") return null;
			if (isSelectingPlaneRef.current) return null;
			return {
				picks: [],
				resolved: { kind: "delegate" }
			};
		},
		onPickStart: (_resolved, _picks, event) => {
			if (isGlyphDraggingActiveRef.current) {
				handleSelectMode(event, false);
				return;
			}
			dispatchPointerEvent(event, true);
		},
		onPickFromMenu: () => {},
		onPointerMove: (event) => {
			if (mode !== "sketch") return;
			if (isSelectingPlaneRef.current) return;
			if (isGlyphDraggingActiveRef.current) {
				handleSelectMode(event, false);
				return;
			}
			dispatchPointerEvent(event, false);
		},
		onPointerUp: (event) => {
			if (mode !== "sketch") return;
			if (isSelectingPlaneRef.current) return;
			if (event.button !== 0) return;
			if (isGlyphDraggingActiveRef.current) {
				handleSelectMode(event, false);
				return;
			}
			dispatchPointerEvent(event, false);
		},
		onCancel: () => {
			if (isSelectingPlaneRef.current) cancelPlaneSelection();
			else if (isDrawingActive()) cancelCurrentOperation();
			else setSketchSubMode("select");
		},
		extraKeys: {
			l: () => {
				cancelCurrentOperation();
				setSketchSubMode("line");
			},
			L: () => {
				cancelCurrentOperation();
				setSketchSubMode("line");
			},
			c: () => {
				cancelCurrentOperation();
				setSketchSubMode("circle");
			},
			C: () => {
				cancelCurrentOperation();
				setSketchSubMode("circle");
			},
			a: () => {
				cancelCurrentOperation();
				setSketchSubMode("arc");
			},
			A: () => {
				cancelCurrentOperation();
				setSketchSubMode("arc");
			},
			p: () => {
				cancelCurrentOperation();
				setSketchSubMode("point");
			},
			P: () => {
				cancelCurrentOperation();
				setSketchSubMode("point");
			},
			d: () => {
				cancelCurrentOperation();
				setSketchSubMode("dimension");
			},
			D: () => {
				cancelCurrentOperation();
				setSketchSubMode("dimension");
			},
			r: () => {
				cancelCurrentOperation();
				setSketchSubMode("rectangle");
			},
			R: () => {
				cancelCurrentOperation();
				setSketchSubMode("rectangle");
			},
			s: () => {
				cancelCurrentOperation();
				setSketchSubMode("select");
			},
			S: () => {
				cancelCurrentOperation();
				setSketchSubMode("select");
			},
			t: () => {
				cancelCurrentOperation();
				setSketchSubMode("trim");
			},
			T: () => {
				cancelCurrentOperation();
				setSketchSubMode("trim");
			},
			e: () => {
				cancelCurrentOperation();
				setSketchSubMode("extend");
			},
			E: () => {
				cancelCurrentOperation();
				setSketchSubMode("extend");
			},
			Delete: () => deleteSelection(),
			Backspace: () => deleteSelection(),
			x: () => toggleConstruction(),
			X: () => toggleConstruction()
		}
	}, {
		raycasterFromEvent,
		selectOtherRef: void 0,
		navToolActiveRef,
		isApplyingRef
	}, holdRefs), [
		mode,
		raycasterFromEvent,
		navToolActiveRef,
		handleSelectMode,
		isGlyphDraggingActiveRef,
		dispatchPointerEvent,
		cancelPlaneSelection,
		isDrawingActive,
		cancelCurrentOperation,
		setSketchSubMode,
		holdRefs
	]);
	function deleteSelection() {
		if (selectedConstraintIdRef.current) {
			pushSketchUndo();
			removeConstraint(selectedConstraintIdRef.current);
			solveSketch();
			setSelectedConstraintId(null);
			return;
		}
		const sketch = activeSketchRef.current;
		if (selectedPrimitivesRef.current.length === 0 || !sketch) return;
		const deletable = selectedPrimitivesRef.current.filter((id) => {
			const p = sketch.primitives.find((x) => x.id === id);
			return !!p && !p.origin;
		});
		if (deletable.length === 0) return;
		pushSketchUndo();
		for (const primId of deletable) removePrimitive(primId);
		clearSelection();
		solveSketch();
	}
	function toggleConstruction() {
		const sketch = activeSketchRef.current;
		if (!sketch || selectedPrimitivesRef.current.length === 0) return;
		for (const primId of selectedPrimitivesRef.current) {
			const prim = sketch.primitives.find((p) => p.id === primId);
			if (!prim) continue;
			if (isSketchLine(prim) || isSketchCircle(prim) || isSketchArc(prim)) {
				if (isSketchLine(prim) && prim.origin) continue;
				updatePrimitive(primId, { construction: !prim.construction });
			}
		}
	}
	/**
	* Public mouse dispatcher: keeps the existing single-callback API the
	* starter is wired to, while routing through the factory for centralized
	* gates + continuous pointer tracking.
	*/
	const handleSketchMode = useCallback((event) => {
		if (mode !== "sketch") return;
		if (isSelectingPlaneRef.current) return;
		if (event.button === 2) {
			if (event.type === "mousedown") handleSelectMode(event, true);
			return;
		}
		if (event.type === "mousemove" && (event.buttons & 2) !== 0 && (event.buttons & 1) === 0) return;
		if (event.type === "mousedown") handlers.handleMouseDown(event);
		else if (event.type === "mousemove") handlers.handleMouseMove(event);
		else if (event.type === "mouseup") handlers.handleMouseUp(event);
	}, [
		mode,
		handleSelectMode,
		handlers
	]);
	const handleKeyDown = useCallback((event) => {
		if (mode !== "sketch") return;
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
		const before = event.defaultPrevented;
		handlers.handleKeyDown(event);
		if (!before && (event.key === "Escape" || [
			"l",
			"c",
			"a",
			"p",
			"d",
			"r",
			"s",
			"t",
			"e",
			"x",
			"Delete",
			"Backspace"
		].includes(event.key.toLowerCase()))) event.preventDefault();
	}, [mode, handlers]);
	useEffect(() => {
		if (mode !== "sketch") clearSelection();
	}, [mode, clearSelection]);
	useEffect(() => {
		if (sketchSubMode !== "select") clearSelection();
	}, [sketchSubMode, clearSelection]);
	return {
		handleSketchMode,
		handleKeyDown
	};
}
//#endregion
//#region src/hooks/useSketchMode.ts
function useSketchMode() {
	const { activeSketch, addPrimitive, updatePrimitive, removePrimitive, updatePrimitivesAndSolve, addConstraintAndSolve, previewConstraint, cancelConstraintPreview, commitConstraintPreview, removeConstraint, updateConstraint, startSketch, solveSketch, mode, elements, getObject, pushSketchUndo, editingSketchId } = useCadCore();
	const { scene, camera, renderer, getMouseIntersection, showGroundPlane, toggleGroundPlane, sceneReady, setCameraRotationEnabled, setDrawingPlane, projectionType, setProjectionType, navToolActiveRef, controlsRef, gridSpacing, gridSnapEnabled } = useCadVisualizer();
	const [sketchSubMode, setSketchSubMode] = useState("line");
	const sketchObjectsRef = useRef([]);
	const { findInferencePoints, findNearestSnap, findGuidelines, isHorizontalAligned, isVerticalAligned } = useSketchInference();
	const [currentInferencePoint, setCurrentInferencePoint] = useState(null);
	const [guidelines, setGuidelines] = useState([]);
	const ctrlHeldRef = useRef(false);
	const projectionTypeRef = useRef(projectionType);
	useEffect(() => {
		projectionTypeRef.current = projectionType;
	}, [projectionType]);
	const sketchHidGroundPlaneRef = useRef(false);
	const originalProjectionRef = useRef(null);
	const cameraAnimFrameRef = useRef(null);
	const { dimSceneBodies, restoreSceneBodies, createSketchGrid, cleanupSketchGrid, orientCameraToPlane } = useSketchSceneVisuals({
		activeSketch,
		editingSketchId,
		cameraAnimFrameRef,
		sketchHidGroundPlaneRef,
		originalProjectionRef,
		projectionTypeRef
	});
	const idCounterRef = useRef(0);
	const { raycastToObjects } = useRaycastToObjects(SKETCH_CONFIG.LINE_HIT_THRESHOLD);
	const lastSnapRef = useRef(null);
	const [contextMenu, setContextMenu] = useState({
		visible: false,
		x: 0,
		y: 0,
		primitiveIds: [],
		primitiveTypes: []
	});
	const [constraintFeedback, setConstraintFeedback] = useState(null);
	const feedbackTimerRef = useRef(null);
	const [selectedConstraintId, setSelectedConstraintId] = useState(null);
	const [editingConstraintId, setEditingConstraintId] = useState(null);
	const isPreviewingRef = useRef(false);
	const previewDebounceRef = useRef(null);
	const previewConstraintIdRef = useRef(null);
	const activeSketchRef = useRef(activeSketch);
	const sketchTo3DRef = useRef((x, y, zOffset = 0) => new THREE.Vector3(x, y, zOffset));
	const { cleanupInferenceObjects, renderInferencePoint, renderGuidelines } = useSketchInferenceRender({ sketchTo3DRef });
	const showConstraintFeedback = useCallback((status) => {
		if (status === "applied" || status === "failed") return;
		if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
		setConstraintFeedback({
			message: status === "redundant" ? "Constraint already satisfied" : "Constraint conflicts with existing constraints",
			type: status
		});
		feedbackTimerRef.current = setTimeout(() => {
			setConstraintFeedback(null);
			feedbackTimerRef.current = null;
		}, 3e3);
	}, []);
	const { INFERENCE_SNAP_DISTANCE, ALIGNMENT_TOLERANCE, DOUBLE_CLICK_THRESHOLD, SNAP_DISTANCE, GLYPH_DRAG_THRESHOLD_PX } = SKETCH_CONFIG;
	useEffect(() => {
		activeSketchRef.current = activeSketch;
	}, [activeSketch]);
	useEffect(() => {
		const onKeyDown = (e) => {
			if (e.key === "Control") ctrlHeldRef.current = true;
		};
		const onKeyUp = (e) => {
			if (e.key === "Control") ctrlHeldRef.current = false;
		};
		const onBlur = () => {
			ctrlHeldRef.current = false;
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", onBlur);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", onBlur);
		};
	}, []);
	const generateId = useCallback((prefix) => {
		idCounterRef.current += 1;
		return `${prefix}_${idCounterRef.current}`;
	}, []);
	const { cleanupTrimHighlight, handleTrimMode, handleExtendMode } = useSketchTrimExtend({
		generateId,
		sketchTo3DRef
	});
	const drawing = useSketchDrawing({
		generateId,
		sketchTo3DRef,
		cleanupInferenceObjects,
		showConstraintFeedback,
		ctrlHeldRef,
		lastSnapRef
	});
	const { isChaining, pendingLineDimension, handleLineDraw, handleRectangleDraw, handleCircleDraw, handleArcDraw, handlePointDraw, cancelCurrentOperation, clearPendingLineDimension, applyLineLengthConstraint, cleanupDrawingPreview } = drawing;
	const closeContextMenu = useCallback(() => {
		if (previewDebounceRef.current) {
			clearTimeout(previewDebounceRef.current);
			previewDebounceRef.current = null;
		}
		if (isPreviewingRef.current) {
			cancelConstraintPreview();
			isPreviewingRef.current = false;
			previewConstraintIdRef.current = null;
		}
		setContextMenu({
			visible: false,
			x: 0,
			y: 0,
			primitiveIds: [],
			primitiveTypes: []
		});
	}, [cancelConstraintPreview]);
	const { selectedPrimitives, selectPrimitive, clearSelection, handleSelectMode, cleanupGlyphDrag, isGlyphDraggingActiveRef } = useSketchSelection({
		generateId,
		sketchTo3DRef,
		activeSketchRef,
		setSelectedConstraintId,
		setEditingConstraintId,
		setContextMenu,
		closeContextMenu,
		sketchObjectsRef
	});
	const { applyConstraint, getCurrentValueForConstraint, handleConstraintPreviewChange, handleConstraintPreviewCancel, deleteConstraint, toggleFixPoint, deleteSelectedPrimitives, applyConstraintToContextMenuPrimitives } = useSketchConstraints({
		generateId,
		activeSketchRef,
		selectedPrimitives,
		clearSelection,
		contextMenu,
		setContextMenu,
		closeContextMenu,
		setSelectedConstraintId,
		showConstraintFeedback,
		isPreviewingRef,
		previewDebounceRef,
		previewConstraintIdRef
	});
	const cleanupSketchPreview = useCallback(() => {
		cleanupDrawingPreview();
		cleanupTrimHighlight();
		cleanupGlyphDrag();
	}, [
		cleanupDrawingPreview,
		cleanupTrimHighlight,
		cleanupGlyphDrag
	]);
	const planeSelection = useSketchPlaneSelection({
		cameraAnimFrameRef,
		sketchHidGroundPlaneRef,
		originalProjectionRef,
		projectionTypeRef,
		dimSceneBodies,
		orientCameraToPlane,
		createSketchGrid,
		cleanupSketchGrid,
		raycastToObjects
	});
	const startNewSketch = useCallback(() => {
		planeSelection.enterPlaneSelectionMode();
	}, [planeSelection.enterPlaneSelectionMode]);
	useSketchRender({
		sketchObjectsRef,
		sketchTo3DRef,
		selectedPrimitives,
		sketchSubMode,
		selectedConstraintId
	});
	const { handleSketchMode, handleKeyDown } = useSketchInputHandlers({
		mode,
		sketchSubMode,
		setSketchSubMode,
		activeSketch,
		ctrlHeldRef,
		lastSnapRef,
		handleLineDraw,
		handleRectangleDraw,
		handleCircleDraw,
		handleArcDraw,
		handlePointDraw,
		handleSelectMode,
		handleTrimMode,
		handleExtendMode,
		cancelCurrentOperation,
		isDrawingActive: drawing.isDrawingActive,
		getChainStartPoint: drawing.getChainStartPoint,
		isSelectingPlane: planeSelection.isSelectingPlane,
		cancelPlaneSelection: planeSelection.cancelPlaneSelection,
		isGlyphDraggingActiveRef,
		renderInferencePoint,
		renderGuidelines,
		cleanupInferenceObjects,
		findInferencePoints,
		findNearestSnap,
		findGuidelines,
		setCurrentInferencePoint,
		setGuidelines,
		selectedPrimitives,
		clearSelection,
		selectedConstraintId,
		setSelectedConstraintId,
		pushSketchUndo,
		removeConstraint,
		removePrimitive,
		solveSketch,
		updatePrimitive
	});
	const exitCleanupRef = useRef(() => {});
	useEffect(() => {
		exitCleanupRef.current = () => {
			if (cameraAnimFrameRef.current !== null) {
				cancelAnimationFrame(cameraAnimFrameRef.current);
				cameraAnimFrameRef.current = null;
			}
			cleanupInferenceObjects();
			cleanupSketchGrid();
			planeSelection.cancelPlaneSelection();
			setCurrentInferencePoint(null);
			setGuidelines([]);
			restoreSceneBodies();
			if (sketchHidGroundPlaneRef.current) {
				toggleGroundPlane();
				sketchHidGroundPlaneRef.current = false;
			}
			if (originalProjectionRef.current !== null) {
				setProjectionType(originalProjectionRef.current);
				originalProjectionRef.current = null;
			}
			setCameraRotationEnabled(true);
			setDrawingPlane(new THREE.Vector3(0, 0, 1));
		};
	});
	useEffect(() => () => exitCleanupRef.current(), []);
	return {
		sketchSubMode,
		setSketchSubMode,
		handleSketchMode,
		handleKeyDown,
		cleanupSketchPreview,
		sketchObjects: sketchObjectsRef.current,
		startNewSketch,
		selectedPrimitives,
		selectPrimitive,
		clearSelection,
		applyConstraint,
		isChaining,
		cancelCurrentOperation,
		currentInferencePoint,
		guidelines,
		pendingLineDimension,
		clearPendingLineDimension,
		applyLineLengthConstraint,
		contextMenu,
		closeContextMenu,
		applyConstraintToContextMenuPrimitives,
		deleteConstraint,
		deleteSelectedPrimitives,
		getCurrentValueForConstraint,
		handleConstraintPreviewChange,
		handleConstraintPreviewCancel,
		isSelectingPlane: planeSelection.isSelectingPlane,
		hoveredPlane: planeSelection.hoveredPlane,
		enterPlaneSelectionMode: planeSelection.enterPlaneSelectionMode,
		cancelPlaneSelection: planeSelection.cancelPlaneSelection,
		selectPlaneAndStartSketch: planeSelection.selectPlaneAndStartSketch,
		cleanupSketchGrid,
		handlePlaneSelectionMouseMove: planeSelection.handlePlaneSelectionMouseMove,
		handlePlaneSelectionClick: planeSelection.handlePlaneSelectionClick,
		setPlaneOffset: planeSelection.setPlaneOffset,
		toggleFixPoint,
		constraintFeedback,
		editingConstraintId
	};
}
//#endregion
//#region src/hooks/sweep/hooks/useSweepApply.ts
function useSweepApply({ stateBag }) {
	const { elements, removeElement, updateElementBrep } = useCadCore();
	const { forceSceneUpdate } = useCadVisualizer();
	const { state, setState } = stateBag;
	return {
		performSweep: useCallback(async () => {
			if (!state.selectedProfile || !state.selectedPath) return;
			const profileEl = elements.find((el) => el.nodeId === state.selectedProfile);
			const pathEl = elements.find((el) => el.nodeId === state.selectedPath);
			if (!profileEl || !pathEl || !pathEl.pathData) return;
			setState((prev) => ({
				...prev,
				isApplying: true
			}));
			try {
				debugLog("[useSweepMode] profileEl.position:", profileEl.position);
				debugLog("[useSweepMode] pathEl.pathData.points:", pathEl.pathData.points);
				const result = await sweepBRep(profileEl.brep, profileEl.position, pathEl.pathData.points, {
					orientation: state.orientation,
					cornerMode: state.cornerMode
				}, profileEl.occBrep);
				if (!result.ok) notify(`Sweep failed: ${result.reason}`, "error");
				else if (result.value.brep.faces.length === 0) notify("Sweep produced empty result", "error");
				else {
					const value = result.value;
					const newPosition = new THREE.Vector3(profileEl.position.x + value.positionOffset.x, profileEl.position.y + value.positionOffset.y, profileEl.position.z + value.positionOffset.z);
					debugLog("[useSweepMode] result.positionOffset:", value.positionOffset);
					debugLog("[useSweepMode] newPosition:", newPosition);
					updateElementBrep(state.selectedProfile, value.brep, newPosition, {
						type: "sweep",
						consumedElementId: state.selectedPath
					}, value.edgeGeometry, value.occBrep, value.faceGeometry, value.vertexPositions);
					removeElement(state.selectedPath);
					forceSceneUpdate();
				}
			} catch (error) {
				console.error("[useSweepMode] Sweep failed:", error);
				notify(`Sweep failed: ${error instanceof Error ? error.message : "unknown error"}`, "error");
			}
			setState((prev) => ({
				...prev,
				phase: "SELECT_PROFILE",
				selectedProfile: null,
				selectedPath: null,
				isApplying: false
			}));
		}, [
			state.selectedProfile,
			state.selectedPath,
			state.orientation,
			state.cornerMode,
			elements,
			updateElementBrep,
			removeElement,
			forceSceneUpdate,
			setState
		]),
		canSweep: state.phase === "READY" && !!state.selectedProfile && !!state.selectedPath
	};
}
//#endregion
//#region src/hooks/sweep/hooks/useSweepInputHandlers.ts
function useSweepInputHandlers({ stateBag, apply, cleanup }) {
	const { elements, getObject } = useCadCore();
	const { forceSceneUpdate, navToolActiveRef, selectOtherRef } = useCadVisualizer();
	const { raycasterFromEvent } = useRaycastToObjects();
	const { state, setState, hoveredId, setHoveredId, hoverPreviewRef, menuOpenRef, resetHover, highlightSelected, selectProfileById, applyHoverPreview } = stateBag;
	const { performSweep, canSweep } = apply;
	const profileFilter = useCallback((el) => el.elementType !== "path" && isFlat(el.brep), []);
	const isApplyingRef = useMemo(() => ({ current: state.isApplying }), [state.isApplying]);
	const holdRefs = useModeInputHoldRefs();
	return useMemo(() => {
		return createModeInputHandlers({
			pickTargets: (raycaster) => {
				if (state.phase === "READY") return null;
				if (state.phase === "SELECT_PROFILE") {
					const picks = collectPicksUnderCursor(raycaster, elements, getObject, {
						filter: profileFilter,
						nameFor: makeBodyOrProfileLabel(elements)
					});
					if (picks.length === 0) return null;
					return {
						picks,
						resolved: {
							kind: "profile",
							elementId: picks[0].elementId
						}
					};
				}
				const allObjects = [...collectPickableMeshes(elements, getObject)];
				elements.forEach((el) => {
					if (el.elementType === "path") {
						const obj = getObject(el.nodeId);
						if (obj) obj.traverse((child) => {
							if (child instanceof THREE.Line) allObjects.push(child);
						});
					}
				});
				const intersects = raycaster.intersectObjects(allObjects, false);
				if (intersects.length === 0) return null;
				const pickedObject = intersects[0].object;
				for (const el of elements) {
					const obj = getObject(el.nodeId);
					if (!obj || !isDescendantOf(pickedObject, obj)) continue;
					if (el.elementType !== "path" || !el.pathData) continue;
					return {
						picks: [{
							key: el.nodeId,
							label: el.nodeId,
							distance: intersects[0].distance,
							elementId: el.nodeId,
							object: obj
						}],
						resolved: {
							kind: "path",
							elementId: el.nodeId
						}
					};
				}
				return null;
			},
			hoverTargets: (raycaster) => {
				if (state.phase === "READY") return null;
				const allObjects = [];
				elements.forEach((el) => {
					const obj = getObject(el.nodeId);
					if (!obj) return;
					obj.traverse((child) => {
						if (child instanceof THREE.Mesh && !child.userData.isEdgeOverlay && !child.userData.isHelper) allObjects.push(child);
						if (child instanceof THREE.Line && child.userData.isPathLine) allObjects.push(child);
					});
				});
				const intersects = raycaster.intersectObjects(allObjects, false);
				if (intersects.length === 0) return null;
				const pickedObject = intersects[0].object;
				for (const el of elements) {
					const obj = getObject(el.nodeId);
					if (obj && isDescendantOf(pickedObject, obj)) {
						if (state.phase === "SELECT_PROFILE" && el.elementType !== "path" && isFlat(el.brep)) return {
							kind: "profile",
							elementId: el.nodeId
						};
						if (state.phase === "SELECT_PATH" && el.elementType === "path") return {
							kind: "path",
							elementId: el.nodeId
						};
						return null;
					}
				}
				return null;
			},
			onPickStart: (resolved) => {
				if (resolved.kind === "profile") selectProfileById(resolved.elementId);
				else {
					resetHover();
					highlightSelected(resolved.elementId, SELECTION.selected);
					setState((prev) => ({
						...prev,
						phase: "READY",
						selectedPath: resolved.elementId
					}));
				}
			},
			onPickFromMenu: (item, resolved) => {
				menuOpenRef.current = false;
				hoverPreviewRef.current = null;
				if (resolved.kind === "profile") selectProfileById(item.elementId);
			},
			onHover: (hoverPick) => {
				const foundId = hoverPick?.elementId ?? null;
				if (foundId && foundId !== hoveredId && foundId !== state.selectedProfile && foundId !== state.selectedPath) {
					resetHover();
					setHoveredId(foundId);
					highlightSelected(foundId, SELECTION.hover);
					forceSceneUpdate();
				} else if (!foundId && hoveredId) {
					resetHover();
					forceSceneUpdate();
				}
				return null;
			},
			onMenuOpen: (resolved) => {
				if (resolved.kind === "profile") {
					menuOpenRef.current = true;
					highlightSelected(resolved.elementId, BODY.default);
				}
			},
			onMenuCancel: (resolved) => {
				if (resolved.kind === "profile") {
					menuOpenRef.current = false;
					hoverPreviewRef.current = null;
					highlightSelected(state.selectedProfile ?? resolved.elementId, SELECTION.selected);
				}
			},
			onCancel: () => {
				if (state.phase === "READY" || state.phase === "SELECT_PATH") cleanup();
			},
			onCommit: () => {
				if (canSweep) performSweep();
			},
			enableContextMenu: state.phase === "SELECT_PROFILE"
		}, {
			raycasterFromEvent,
			selectOtherRef,
			navToolActiveRef,
			isApplyingRef
		}, holdRefs);
	}, [
		elements,
		getObject,
		profileFilter,
		selectProfileById,
		applyHoverPreview,
		highlightSelected,
		resetHover,
		forceSceneUpdate,
		raycasterFromEvent,
		selectOtherRef,
		navToolActiveRef,
		isApplyingRef,
		holdRefs,
		state.phase,
		state.selectedProfile,
		state.selectedPath,
		setState,
		hoveredId,
		setHoveredId,
		hoverPreviewRef,
		menuOpenRef,
		cleanup,
		canSweep,
		performSweep
	]);
}
//#endregion
//#region src/hooks/sweep/hooks/useSweepState.ts
function useSweepState() {
	const { getObject } = useCadCore();
	const [state, setState] = useState({
		phase: "SELECT_PROFILE",
		selectedProfile: null,
		selectedPath: null,
		isApplying: false,
		orientation: "perpendicular",
		cornerMode: "right"
	});
	const [hoveredId, setHoveredId] = useState(null);
	const holdStartRef = useRef(null);
	const menuOpenRef = useRef(false);
	const { hoverPreviewRef, applyHoverPreview, restoreHoverPreview } = useHoverPreview();
	/** Reset hover highlight back to default body color. */
	const resetHover = useCallback(() => {
		if (hoveredId) {
			tintMeshes(getObject, hoveredId, BODY.default);
			setHoveredId(null);
		}
	}, [getObject, hoveredId]);
	/** Highlight a profile (mesh) or path (line) with the given color. */
	const highlightSelected = useCallback((nodeId, color) => tintMeshesAndPathLines(getObject, nodeId, color), [getObject]);
	return {
		state,
		setState,
		hoveredId,
		setHoveredId,
		holdStartRef,
		hoverPreviewRef,
		menuOpenRef,
		resetHover,
		highlightSelected,
		applyHoverPreview,
		restoreHoverPreview,
		selectProfileById: useCallback((elementId) => {
			resetHover();
			highlightSelected(elementId, SELECTION.selected);
			setState((prev) => ({
				...prev,
				phase: "SELECT_PATH",
				selectedProfile: elementId
			}));
		}, [resetHover, highlightSelected]),
		setOrientation: useCallback((orientation) => {
			setState((prev) => ({
				...prev,
				orientation
			}));
		}, []),
		setCornerMode: useCallback((cornerMode) => {
			setState((prev) => ({
				...prev,
				cornerMode
			}));
		}, [])
	};
}
//#endregion
//#region src/hooks/useSweepMode.ts
/**
* Hook for Fusion 360-style sweep mode.
* State machine: SELECT_PROFILE → SELECT_PATH → READY (Enter to apply)
*
* Composed of three sub-hooks living under `hooks/sweep/`:
*   - useSweepState         (state + refs + setters + hover/highlight + select-other preview)
*   - useSweepApply         (performSweep + canSweep)
*   - useSweepInputHandlers (mouse + keyboard + context menu)
*/
function useSweepMode() {
	const { getObject, mode } = useCadCore();
	const stateBag = useSweepState();
	const apply = useSweepApply({ stateBag });
	const { state, setState, resetHover, highlightSelected, setOrientation, setCornerMode } = stateBag;
	const { cleanup } = useModeCleanup(mode, "sweep", () => {
		resetHover();
		if (state.selectedProfile) highlightSelected(state.selectedProfile, BODY.default);
		if (state.selectedPath) {
			const obj = getObject(state.selectedPath);
			if (obj) obj.traverse((child) => {
				if (child instanceof THREE.Line && child.userData.isPathLine) child.material.color.set(SWEEP.pathPreview);
			});
		}
		setState((prev) => ({
			...prev,
			phase: "SELECT_PROFILE",
			selectedProfile: null,
			selectedPath: null,
			isApplying: false
		}));
	});
	const handlers = useSweepInputHandlers({
		stateBag,
		apply,
		cleanup
	});
	return {
		phase: state.phase,
		selectedProfile: state.selectedProfile,
		selectedPath: state.selectedPath,
		isApplying: state.isApplying,
		orientation: state.orientation,
		cornerMode: state.cornerMode,
		setOrientation,
		setCornerMode,
		handleMouseDown: handlers.handleMouseDown,
		handleMouseMove: handlers.handleMouseMove,
		handleMouseUp: handlers.handleMouseUp,
		handleContextMenu: handlers.handleContextMenu,
		handleKeyDown: handlers.handleKeyDown,
		performSweep: apply.performSweep,
		canSweep: apply.canSweep,
		cleanup
	};
}
//#endregion
//#region src/contexts/visualizer/hooks/useVisualizerResize.ts
/**
* Subscribe to canvas-container resize events. The callback receives the new
* width/height in CSS pixels and is invoked once on mount with the current size.
*
* Use this instead of `window.addEventListener("resize", ...)` so resizes that
* change the canvas container without changing the window (split panes, dock
* panels, devtools) are still observed.
*/
function useVisualizerResize(listener) {
	const { subscribeResize } = useCadVisualizer();
	useEffect(() => {
		return subscribeResize(listener);
	}, [subscribeResize, listener]);
}
//#endregion
export { CadCoreContext, CadCoreProvider, CadVisualizerContext, CadVisualizerProvider, DRAG_THRESHOLD_PX, FACE_NORMALS, HOLD_MS, getViewDirection, useCadCore, useCadVisualizer, useCameraAnimation, useCombineMode, useExtrudeMode, useFilletMode, useLoftMode, useMeasureMode, useMoveMode, useRevolveMode, useSelectOther, useSketchInference, useSketchMode, useSweepMode, useVisualizerResize };

//# sourceMappingURL=react.mjs.map
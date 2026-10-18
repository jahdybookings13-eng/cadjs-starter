// Wires the rebuild executor and scene sync to the feature-tree singleton.
import { scadgenHistory } from "./featureEngine";
import { scadgenExecutor } from "./executor";
import { scadgenSceneSync } from "./sceneSync";

scadgenExecutor.attach(scadgenHistory);
scadgenSceneSync.bindExecutor(scadgenExecutor);

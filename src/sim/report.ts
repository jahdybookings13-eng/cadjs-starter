import { materialForBody, type SimDocument } from "./model";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function number(value: number, digits = 3): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function rows(entries: Array<[string, string]>): string {
  return entries
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("");
}

export function buildSimulationReport(document: SimDocument): string {
  const mesh = document.mesh;
  const material = mesh ? materialForBody(document, mesh.bodyId) : null;
  const staticEntries: Array<[string, string]> = document.result
    ? [
        [
          "Max displacement",
          `${number(document.result.maxDisplacementM * 1000, 5)} mm`,
        ],
        [
          "Max von Mises",
          `${number(document.result.maxVonMisesPa / 1e6, 4)} MPa`,
        ],
        [
          "Principal range",
          `${number(document.result.minPrincipalPa / 1e6, 3)} / ${number(
            document.result.maxPrincipalPa / 1e6,
            3,
          )} MPa`,
        ],
        [
          "Max equivalent strain",
          number(document.result.maxEquivalentStrain ?? 0, 6),
        ],
        [
          "Minimum safety factor",
          number(document.result.minSafetyFactor ?? 0, 3),
        ],
        ["Max reaction", `${number(document.result.maxReactionN ?? 0, 3)} N`],
        [
          "Solve",
          `${number(document.result.solveMs, 1)} ms · ${document.result.iterations} CG iterations`,
        ],
      ]
    : [];
  if (document.result?.inertialRelief) {
    const relief = document.result.inertialRelief;
    staticEntries.push([
      "Inertial relief",
      `acceleration ${number(Math.hypot(relief.accelerationMps2.x, relief.accelerationMps2.y, relief.accelerationMps2.z), 5)} m/s² · angular ${number(Math.hypot(relief.angularAccelerationRadS2.x, relief.angularAccelerationRadS2.y, relief.angularAccelerationRadS2.z), 5)} rad/s² · ${relief.supportNodes.length} support nodes`,
    ]);
  }
  if (document.result?.contactIterations !== undefined) {
    staticEntries.push([
      "Contact solve",
      `${document.result.activeContacts ?? 0} active constraints · ${
        document.result.contactIterations
      } active-set iterations · max penetration ${number(
        (document.result.maxContactPenetrationM ?? 0) * 1000,
        5,
      )} mm`,
    ]);
  }
  const targetRows = document.result?.target
    ? rows([
        ["Target body", document.result.target.bodyName],
        [
          "Target max displacement",
          `${number(document.result.target.maxDisplacementM * 1000, 5)} mm`,
        ],
        [
          "Target max von Mises",
          `${number(document.result.target.maxVonMisesPa / 1e6, 4)} MPa`,
        ],
        [
          "Target max equivalent strain",
          number(document.result.target.maxEquivalentStrain ?? 0, 6),
        ],
        [
          "Target minimum safety factor",
          number(document.result.target.minSafetyFactor ?? 0, 3),
        ],
      ])
    : `<tr><td colspan="2">No target result.</td></tr>`;
  const solvedContact = document.result?.contact ?? document.contact;
  const staticRows = document.result
    ? rows(staticEntries)
    : `<tr><td colspan="2">No static result.</td></tr>`;
  const thermalRows = document.thermal
    ? rows([
        [
          "Temperature range",
          `${number(document.thermal.minTemperatureC, 2)} – ${number(
            document.thermal.maxTemperatureC,
            2,
          )} °C`,
        ],
        [
          "Applied heat flux",
          `${number(document.thermal.appliedHeatFluxW, 3)} W`,
        ],
        [
          "Solve",
          `${number(document.thermal.solveMs, 1)} ms · ${document.thermal.iterations} CG iterations`,
        ],
      ])
    : `<tr><td colspan="2">No thermal result.</td></tr>`;
  const modalRows = document.modal
    ? document.modal.modes
        .map(
          (mode, index) =>
            `<tr><th>Mode ${index + 1}</th><td>${number(
              mode.frequencyHz,
              3,
            )} Hz · ${number(mode.energyJ ?? 0, 6)} J at 1 mm peak</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2">No modal result.</td></tr>`;
  const bucklingRows = document.buckling
    ? document.buckling.modes
        .map(
          (mode, index) =>
            `<tr><th>Buckling mode ${index + 1}</th><td>× ${number(
              mode.multiplier,
              4,
            )} reference load</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2">No buckling result.</td></tr>`;
  const contactRows = solvedContact
    ? solvedContact.findings
        .map(
          (finding) =>
            `<tr><th>${escapeHtml(finding.name)}</th><td>${escapeHtml(
              finding.status,
            )} · gap ${number(finding.gap, 4)} ${document.units} · penalty ${number(
              finding.penaltyForceN,
              3,
            )} N · friction ${number(finding.frictionForceN ?? 0, 3)} N</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2">No contact result.</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(document.name)} — Simulation report</title>
<style>
body{font:14px system-ui,sans-serif;margin:32px;color:#18212b}
h1{font-size:22px}h2{font-size:15px;margin-top:24px}
table{border-collapse:collapse;width:100%;max-width:820px}
th,td{border-bottom:1px solid #d9e0e7;padding:6px 8px;text-align:left;vertical-align:top}
th{width:38%;color:#53616f;font-weight:600}
.note{color:#53616f;font-size:12px}
</style>
</head>
<body>
<h1>${escapeHtml(document.name)}</h1>
<p class="note">Generated locally by Simulation Studio. Units: ${escapeHtml(
    document.units,
  )}. ${escapeHtml(new Date().toISOString())}</p>
<h2>Model</h2>
<table>${rows([
    ["Body", document.body?.name ?? "—"],
    ["Mesh nodes", mesh ? String(mesh.nodes.length) : "—"],
    ["TET4 elements", mesh ? String(mesh.elements.length) : "—"],
    [
      "Mesh volume",
      mesh ? `${number(mesh.volume, 2)} ${document.units}³` : "—",
    ],
    ["Material", material?.name ?? "—"],
    [
      "Conductivity",
      material ? `${number(material.conductivity, 3)} W/(m K)` : "—",
    ],
    ["Fixtures", String(document.fixtures.length)],
    ["Loads", String(document.loads.length)],
    ["Thermal boundaries", String(document.thermalBoundaries.length)],
    ["Contact pairs", String(document.contacts.length)],
    ["Inertial relief", document.inertialRelief ? "Enabled" : "Disabled"],
  ])}</table>
<h2>Linear static</h2><table>${staticRows}</table>
<h2>Contact target</h2><table>${targetRows}</table>
<h2>Modal</h2><table>${modalRows}</table>
<h2>Thermal</h2><table>${thermalRows}</table>
<h2>Buckling</h2><table>${bucklingRows}</table>
<h2>Contacts</h2><table>${contactRows}</table>
<p class="note">This report records local solver output. Contact is a two-body TET4 penalty solve: both bodies are meshed and deform, and the contact stiffness is assembled into the combined system. It does not claim cloud solving, nonlinear plasticity or a validated certification.</p>
</body>
</html>`;
}

// flux/agent/registry.ts — faithful port of the flux.ai copilot prompt registry
// (RE'd from /tmp/flux-re/app/kernel/Editor.js, 2026-11-04).
//
// Every action is DATA: action id, display label, the selection contract
// (how many/which designators it needs), the submenu group, the prompt template
// (with {placeholders}), and — for actions that mutate the schematic — the tool
// name + arg schema. The orchestrator consumes this; the MCP client serialises
// it to tool calls for whatever LLM brain the user provisioned.
//
// This is "project inside a project": the registry lives inside scadgen and is
// callable from the desk, VR, voice, or the ActionBus by id — identical surface.

export type SelectionMode =
  | "none" // no selection required (whole-project prompt)
  | "optionalAnyToDesignator"
  | "optionalAnyToDesignators"
  | "requireAnyToDesignator"
  | "requireAnyToDesignators"
  | "requireExactlyTwoToPair";

export type SubmenuGroup =
  | "root" // no submenu — top-level
  | "addSubcircuit"
  | "componentAnalysis"
  | "detailedReviews"
  | "manufacturingPrep"
  | "advancedSimulation";

/** A typed tool invocation the orchestrator can dispatch locally or via MCP. */
export interface ToolSpec {
  name: string;
  args: Record<string, { type: string; desc: string }>;
}

export interface PromptAction {
  /** The flux action key (== bus id suffix). Stable id. */
  key: string;
  /** Human label (i18n key in flux; we keep the plain string). */
  label: string;
  selectionMode: SelectionMode;
  submenuGroup: SubmenuGroup;
  /** Prompt template with {placeholders}. */
  prompt: string;
  /** Places to fill. */
  placeholders?: string[];
  /** If it mutates the schematic — the tool it maps to. */
  tool?: ToolSpec;
  /** Read/analysis actions (no mutation). */
  kind: "mutate" | "analyze" | "generate" | "review" | "help";
  /** Short description shown in the menu. */
  desc?: string;
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

export const PROMPT_REGISTRY: Record<string, PromptAction> = {
  // ---- ask / explain -------------------------------------------------------
  ask: {
    key: "ask",
    label: "Ask about a selection",
    selectionMode: "optionalAnyToDesignators",
    submenuGroup: "root",
    prompt: "Please explain what {designators} {verb}.",
    kind: "analyze",
    desc: "Explain what the selected parts do.",
  },
  explain: {
    key: "explain",
    label: "Explain selection",
    selectionMode: "optionalAnyToDesignators",
    submenuGroup: "root",
    prompt: "Please explain what {designators} {verb}.",
    kind: "analyze",
    desc: "Explain the selected components and circuit.",
  },
  explainProject: {
    key: "explainProject",
    label: "Explain this project",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Explain this project.\n\nDescribe its purpose, core components, and how they interact. \n\nBreak down the design, implementation, and functionality. Highlight key technologies, dependencies, and design choices, including trade-offs and optimization opportunities.",
    kind: "analyze",
    desc: "High-level explanation of the whole project.",
  },
  howToUseFlux: {
    key: "howToUseFlux",
    label: "How do I use Flux?",
    selectionMode: "none",
    submenuGroup: "root",
    prompt: "How do I use Flux?",
    kind: "help",
    desc: "Get a guided tour of Flux.",
  },

  // ---- compare ------------------------------------------------------------
  compareComponents: {
    key: "compareComponents",
    label: "Compare components",
    selectionMode: "requireAnyToDesignators",
    submenuGroup: "componentAnalysis",
    prompt:
      "Generate a markdown-formatted table to compare {designators}. Highlight the main differences between them. I am especially interested in the electrical differences (maximum ratings, input and output voltages, currents, etc), pinout differences, tolerances, main features, as well as part availability and lifecycle.",
    kind: "analyze",
    desc: "Side-by-side electrical comparison of two or more parts.",
  },

  // ---- design (mutates) ----------------------------------------------------
  connectComponents: {
    key: "connectComponents",
    label: "Connect components",
    selectionMode: "requireExactlyTwoToPair",
    submenuGroup: "root",
    prompt: "How do I connect {designator1} and {designator2}?",
    kind: "mutate",
    tool: {
      name: "connectComponents",
      args: {
        a: { type: "string", desc: "first designator" },
        b: { type: "string", desc: "second designator" },
        pinA: { type: "string", desc: "pin on A" },
        pinB: { type: "string", desc: "pin on B" },
      },
    },
    desc: "Wire two components together.",
  },
  wirePowerNets: {
    key: "wirePowerNets",
    label: "Wire power nets",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Review and wire the power nets in this design. Ensure all VCC, VDD, GND, and other power pins are properly connected to the correct power rails. Identify any power pins that are currently unconnected and connect them appropriately.",
    kind: "mutate",
    tool: { name: "wirePowerNets", args: {} },
    desc: "Auto-assign power pins to their rails.",
  },
  addBypassCaps: {
    key: "addBypassCaps",
    label: "Add bypass / decoupling caps",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Analyze the ICs in this design and add appropriate bypass and decoupling capacitors. For each IC, determine the correct capacitor values based on the datasheet recommendations, operating frequencies, and power supply requirements. Place them as close as possible to the power pins in the schematic.",
    kind: "mutate",
    tool: { name: "addBypassCaps", args: {} },
    desc: "Insert decoupling caps on every IC power pin.",
  },
  addResistor: {
    key: "addResistor",
    label: "Add resistor",
    selectionMode: "none",
    submenuGroup: "root",
    prompt: "Add a resistor to this design.",
    kind: "mutate",
    tool: {
      name: "addResistor",
      args: {
        designator: { type: "string", desc: "e.g. R1" },
        value: { type: "string", desc: "e.g. 10k" },
      },
    },
    desc: "Place a resistor.",
  },
  addCapacitor: {
    key: "addCapacitor",
    label: "Add capacitor",
    selectionMode: "none",
    submenuGroup: "root",
    prompt: "Add a capacitor to this design.",
    kind: "mutate",
    tool: {
      name: "addCapacitor",
      args: {
        designator: { type: "string", desc: "e.g. C1" },
        value: { type: "string", desc: "e.g. 100n" },
      },
    },
    desc: "Place a capacitor.",
  },
  addInductor: {
    key: "addInductor",
    label: "Add inductor",
    selectionMode: "none",
    submenuGroup: "root",
    prompt: "Add an inductor to this design.",
    kind: "mutate",
    tool: {
      name: "addInductor",
      args: {
        designator: { type: "string", desc: "e.g. L1" },
        value: { type: "string", desc: "e.g. 10uH" },
      },
    },
    desc: "Place an inductor.",
  },

  // ---- addSubcircuit submenu ---------------------------------------------
  addVoltageDivider: {
    key: "addVoltageDivider",
    label: "Add voltage divider",
    selectionMode: "none",
    submenuGroup: "addSubcircuit",
    prompt:
      "Add a resistive voltage divider to this design. Analyze the existing design to determine the available voltage rails and what output voltage is likely needed. If the purpose can't be inferred, ask me about the target output voltage and expected load. Select standard resistor values from the library and add them to the schematic.",
    kind: "mutate",
    tool: {
      name: "addVoltageDivider",
      args: {
        rail: { type: "string", desc: "supply net" },
        target: { type: "number", desc: "output volts" },
      },
    },
    desc: "Subcircuit: resistive voltage divider.",
  },
  addRCFilter: {
    key: "addRCFilter",
    label: "Add RC filter",
    selectionMode: "none",
    submenuGroup: "addSubcircuit",
    prompt:
      "Add an RC filter to this design. Ask me whether I need a low-pass or high-pass configuration and the desired cutoff frequency, then calculate and select appropriate resistor and capacitor values from the library.",
    kind: "mutate",
    tool: {
      name: "addRCFilter",
      args: {
        type: { type: "string", desc: "lp | hp" },
        fc: { type: "number", desc: "cutoff Hz" },
      },
    },
    desc: "Subcircuit: RC low/high-pass.",
  },
  addHBridge: {
    key: "addHBridge",
    label: "Add H-bridge motor driver",
    selectionMode: "none",
    submenuGroup: "addSubcircuit",
    prompt:
      "Add an H-bridge motor driver circuit to this design. Ask me about the motor voltage and current requirements. Analyze the existing design to determine available supply voltages and control outputs, then recommend an appropriate H-bridge IC or discrete MOSFET design with flyback diodes and gate drive circuitry.",
    kind: "mutate",
    tool: {
      name: "addHBridge",
      args: {
        vMotor: { type: "number", desc: "motor volts" },
        iMotor: { type: "number", desc: "motor amps" },
      },
    },
    desc: "Subcircuit: H-bridge driver.",
  },
  addPowerSupply: {
    key: "addPowerSupply",
    label: "Add power supply",
    selectionMode: "none",
    submenuGroup: "addSubcircuit",
    prompt:
      "Add a power supply circuit to this design. First, analyze the existing components to determine what supply voltages and currents are needed. Then ask me about the power source (USB, battery, wall adapter, solar, etc.) since that can't be inferred from the schematic. Based on the power source and required rails, recommend an appropriate regulator topology (LDO, buck, boost, buck-boost) and select specific components from the library.",
    kind: "mutate",
    tool: {
      name: "addPowerSupply",
      args: {
        source: { type: "string", desc: "usb|battery|adapter|solar" },
        rail: { type: "number", desc: "output volts" },
        current: { type: "number", desc: "amps" },
      },
    },
    desc: "Subcircuit: regulator + source.",
  },
  addUsbInterface: {
    key: "addUsbInterface",
    label: "Add USB interface",
    selectionMode: "none",
    submenuGroup: "addSubcircuit",
    prompt:
      "Add a USB interface circuit to this design. Analyze the existing design to determine if there's already a microcontroller or IC with USB capability, and what data rates or protocols are likely needed. Ask me about the connector type (USB-C, Micro-USB, USB-A) and whether this is a host or device. Include ESD protection, proper termination, and any required controller or PHY based on the design's needs.",
    kind: "mutate",
    tool: {
      name: "addUsbInterface",
      args: {
        connector: { type: "string", desc: "USB-C|Micro-USB|USB-A" },
        role: { type: "string", desc: "host|device" },
      },
    },
    desc: "Subcircuit: USB + ESD + PHY.",
  },
  addSensorInterface: {
    key: "addSensorInterface",
    label: "Add sensor interface",
    selectionMode: "none",
    submenuGroup: "addSubcircuit",
    prompt:
      "Add a sensor interface circuit to this design. Ask me what I want to measure (temperature, pressure, acceleration, humidity, light, etc.). Then analyze the existing design to determine available communication buses (I2C, SPI, analog inputs) and voltage levels, and recommend a suitable sensor with the appropriate interface circuitry including any required pull-ups, filtering, level shifting, or signal conditioning.",
    kind: "mutate",
    tool: {
      name: "addSensorInterface",
      args: {
        measurand: { type: "string", desc: "temp|pressure|acc|hum|light" },
        bus: { type: "string", desc: "i2c|spi|adc" },
      },
    },
    desc: "Subcircuit: sensor + conditioning.",
  },
  addServoController: {
    key: "addServoController",
    label: "Add servo / motor controller",
    selectionMode: "none",
    submenuGroup: "addSubcircuit",
    prompt:
      "Add a servo or motor controller circuit to this design. Ask me about the motor type (hobby servo, DC motor, stepper, BLDC). Analyze the existing design to determine available PWM outputs, supply voltages, and control interfaces, then recommend an appropriate driver IC or discrete circuit with flyback protection and proper decoupling for the motor's requirements.",
    kind: "mutate",
    tool: {
      name: "addServoController",
      args: {
        motor: { type: "string", desc: "servo|dc|stepper|bldc" },
      },
    },
    desc: "Subcircuit: motor driver.",
  },
  addSubcircuit: {
    key: "addSubcircuit",
    label: "Add subcircuit",
    selectionMode: "none",
    submenuGroup: "addSubcircuit",
    prompt: "Add a subcircuit to this design.",
    kind: "mutate",
    tool: {
      name: "addSubcircuit",
      args: { name: { type: "string", desc: "" } },
    },
    desc: "Group components into a named subcircuit.",
  },

  // ---- componentAnalysis submenu -----------------------------------------
  recommendMpn: {
    key: "recommendMpn",
    label: "Recommend MPN",
    selectionMode: "requireAnyToDesignator",
    submenuGroup: "componentAnalysis",
    prompt:
      "Given how {designators} is used in my schematic and its properties please recommend a manufacturer part number (MPN)",
    kind: "analyze",
    desc: "Pick a real part number for a placeholder.",
  },
  recommendReplacement: {
    key: "recommendReplacement",
    label: "Recommend replacement",
    selectionMode: "requireAnyToDesignator",
    submenuGroup: "componentAnalysis",
    prompt: "Recommend a replacement for {designator}.",
    kind: "analyze",
    desc: "Find a pin-compatible drop-in.",
  },
  verifyPartDetails: {
    key: "verifyPartDetails",
    label: "Verify part details",
    selectionMode: "requireAnyToDesignator",
    submenuGroup: "componentAnalysis",
    prompt:
      "For {designator}, verify all details that could cause manufacturing issues: pin count and functions, package type and dimensions (pad sizes, pitch, exposed pad, orientation), and correct MPN/variant. Cross-check the schematic symbol and footprint against the datasheet. Flag any mismatches that could cause assembly problems, incorrect part ordering, or board failure.",
    kind: "review",
    desc: "Cross-check symbol/footprint/MPN vs datasheet.",
  },
  listPinNamesAndFunctions: {
    key: "listPinNamesAndFunctions",
    label: "List pins",
    selectionMode: "requireAnyToDesignators",
    submenuGroup: "componentAnalysis",
    prompt:
      "List all {designators} pins in a table format. For each pin provide its pin number, pin name and function.",
    kind: "analyze",
    desc: "Pinout table for the selected parts.",
  },
  calculateVoltageDivider: {
    key: "calculateVoltageDivider",
    label: "Calculate voltage divider",
    selectionMode: "requireExactlyTwoToPair",
    submenuGroup: "componentAnalysis",
    prompt:
      "Calculate the voltage divider ratio and output voltage for {designator1} and {designator2}. Show the formula, expected output voltage, and current draw.",
    kind: "analyze",
    desc: "Compute Vout from two resistors.",
  },

  // ---- detailedReviews submenu (analysis) + sim + BoM + parts --------------
  findIssues: {
    key: "findIssues",
    label: "Find issues",
    selectionMode: "none",
    submenuGroup: "detailedReviews",
    prompt: "Are there any issues in this project?",
    kind: "review",
    desc: "Scan for electrical or design problems.",
  },
  runErcDrc: {
    key: "runErcDrc",
    label: "Run ERC/DRC",
    selectionMode: "none",
    submenuGroup: "detailedReviews",
    prompt:
      "Run a comprehensive ERC (Electrical Rules Check) and DRC (Design Rules Check) on this design. Check for unconnected pins, floating nets, short circuits, missing power connections, incorrect net assignments, and any other electrical or design rule violations. Present results in a categorized table with severity levels.",
    kind: "review",
    desc: "Full electrical + design rule check.",
  },
  reviewDecouplingCapPresence: {
    key: "reviewDecouplingCapPresence",
    label: "Review decoupling caps",
    selectionMode: "none",
    submenuGroup: "detailedReviews",
    prompt: "Review decoupling capacitor presence for all ICs in this design.",
    kind: "review",
    desc: "Check every IC has its bypass cap.",
  },
  reviewEnableResetPins: {
    key: "reviewEnableResetPins",
    label: "Review reset/enable pins",
    selectionMode: "none",
    submenuGroup: "detailedReviews",
    prompt:
      "Check that all reset/enable pins have an external pull-up or pull-down resistors. Report action items in an ordered list.",
    kind: "review",
    desc: "Verify pull-up/pull-down on reset/enable pins.",
  },
  reviewUnconnectedPins: {
    key: "reviewUnconnectedPins",
    label: "Review unconnected pins",
    selectionMode: "none",
    submenuGroup: "detailedReviews",
    prompt:
      "Check that none of the unconnected pins require pull-up or pull-down resistors to ensure proper function.",
    kind: "review",
    desc: "Flag NC pins that need a pull.",
  },
  createTestPlan: {
    key: "createTestPlan",
    label: "Create test plan",
    selectionMode: "optionalAnyToDesignators",
    submenuGroup: "detailedReviews",
    prompt:
      "Create a detailed step by step plan table for {designators} to verify their functionality.",
    kind: "generate",
    desc: "Step-by-step bring-up test table.",
  },
  createBlockDiagram: {
    key: "createBlockDiagram",
    label: "Create block diagram",
    selectionMode: "optionalAnyToDesignators",
    submenuGroup: "root",
    prompt:
      "Create a high level mermaid block diagram of {designators}. Include key component's manufacturer part number in each block whenever possible.",
    kind: "generate",
    desc: "Mermaid block diagram with MPNs.",
  },
  generateBom: {
    key: "generateBom",
    label: "Generate BoM",
    selectionMode: "none",
    submenuGroup: "manufacturingPrep",
    prompt:
      "Generate a complete Bill of Materials for this project. Include designator, quantity, value, package, manufacturer part number, manufacturer, description, and estimated unit pricing where available. Group by component type and provide a total estimated cost.",
    kind: "generate",
    desc: "Full BoM grouped + costed.",
  },
  passiveComponentConsolidation: {
    key: "passiveComponentConsolidation",
    label: "Consolidate passives",
    selectionMode: "none",
    submenuGroup: "manufacturingPrep",
    prompt:
      "Perform a BoM consolidation review to identify passive components that could share a single MPN.",
    kind: "generate",
    desc: "Dedupe passive parts to fewer MPNs.",
  },
  checkAvailability: {
    key: "checkAvailability",
    label: "Check availability",
    selectionMode: "none",
    submenuGroup: "manufacturingPrep",
    prompt:
      "Check the availability and lead times for all components in this project. Flag any parts that are out of stock, have long lead times, or are approaching end-of-life. Suggest drop-in replacements for any at-risk components.",
    kind: "analyze",
    desc: "Stock / lead-time / EOL report.",
  },
  generateFmeaReport: {
    key: "generateFmeaReport",
    label: "Generate FMEA",
    selectionMode: "none",
    submenuGroup: "detailedReviews",
    prompt:
      "Develop an FMEA (Failure Mode and Effects Analysis) report in a table format that analyzes the systems schematic, each unique component specification, and operational parameters. It should identify critical failure modes, assess their impact, and recommend mitigation actions based on severity, occurrence probability, and detectability. Include columns such as: process step, potential failure mode, potential failure effect, S, O, D, RPN, Action Recommended, and any other you see fit.",
    kind: "generate",
    desc: "Failure-mode table with RPN.",
  },
  generateRegulatoryChecklist: {
    key: "generateRegulatoryChecklist",
    label: "Generate regulatory checklist",
    selectionMode: "none",
    submenuGroup: "manufacturingPrep",
    prompt:
      "Analyze this project's BOM and project specification to determine what regulatory certifications are required (FCC, CE, UL, IEC, medical, automotive, etc.). Create a regulatory documentation checklist as a project file, identifying the applicable standards, required documents, and current status of each item.",
    kind: "generate",
    desc: "FCC/CE/UL/IEC certification checklist.",
  },

  // ---- advancedSimulation --------------------------------------------------
  circuitRobustnessAnalyzer: {
    key: "circuitRobustnessAnalyzer",
    label: "Monte-Carlo robustness",
    selectionMode: "none",
    submenuGroup: "advancedSimulation",
    prompt:
      "Run Monte Carlo analysis on this circuit with 1000 iterations. Test component tolerances (±5% for resistors, ±10% for capacitors, ±2% for inductors) and temperature variations from -40°C to 85°C. Analyze yield probability, identify failure modes, and recommend design improvements.",
    kind: "analyze",
    desc: "1000-iter Monte-Carlo yield.",
  },
  whatIfScenarioExplorer: {
    key: "whatIfScenarioExplorer",
    label: "What-if scenarios",
    selectionMode: "optionalAnyToDesignator",
    submenuGroup: "advancedSimulation",
    prompt:
      "Stress-test {designator} under extreme conditions: overvoltage (±50% rated), overcurrent (2x rated), temperature extremes (-40°C to 125°C). Identify failure points, safe operating limits, and potential degradation mechanisms.",
    kind: "analyze",
    desc: "OV/OC/temp stress on one part.",
  },
  designSpaceOptimization: {
    key: "designSpaceOptimization",
    label: "Design-space optimization",
    selectionMode: "optionalAnyToDesignators",
    submenuGroup: "advancedSimulation",
    prompt:
      "Optimize {designators} for performance and cost. Sweep component values within standard ranges, analyze trade-offs between speed, power consumption, and component cost. Provide optimal values and sensitivity analysis.",
    kind: "analyze",
    desc: "Sweep values, report trade-offs.",
  },
  passiveFilterAnalysis: {
    key: "passiveFilterAnalysis",
    label: "Passive filter analysis",
    selectionMode: "optionalAnyToDesignators",
    submenuGroup: "advancedSimulation",
    prompt:
      "Analyze the passive filter formed by {designators}. Generate a Bode plot showing magnitude and phase response, identify the -3dB cutoff frequency, and report the filter order and rolloff rate.",
    kind: "analyze",
    desc: "RC/LC Bode + -3dB.",
  },
  activeFilterAnalysis: {
    key: "activeFilterAnalysis",
    label: "Active filter analysis",
    selectionMode: "optionalAnyToDesignators",
    submenuGroup: "advancedSimulation",
    prompt:
      "Analyze the active filter circuit involving {designators}. Generate a Bode plot showing magnitude and phase response, identify the -3dB cutoff frequency, passband gain, and check for stability.",
    kind: "analyze",
    desc: "Op-amp filter Bode + stability.",
  },
  currentAnalysis: {
    key: "currentAnalysis",
    label: "DC operating point / current",
    selectionMode: "none",
    submenuGroup: "advancedSimulation",
    prompt:
      "Perform a DC operating point and current analysis on this design. Label node voltages and report the current flowing through each component. Highlight any components operating near or above their rated current.",
    kind: "analyze",
    desc: "DC op-point + per-part current.",
  },
  rippleAnalysis: {
    key: "rippleAnalysis",
    label: "Ripple analysis",
    selectionMode: "none",
    submenuGroup: "advancedSimulation",
    prompt:
      "Analyze the voltage and current ripple in this design. Simulate the power supply or switching sections, measure peak-to-peak ripple on output nodes, and report ripple frequency and amplitude. Suggest improvements if ripple exceeds typical limits.",
    kind: "analyze",
    desc: "p-p ripple on supply nodes.",
  },
  rcTimingLcOscillator: {
    key: "rcTimingLcOscillator",
    label: "RC timing / LC oscillator",
    selectionMode: "none",
    submenuGroup: "advancedSimulation",
    prompt:
      "Analyze the timing or oscillator circuit in this design. For RC timing circuits, calculate and simulate charge/discharge waveforms and time constants. For LC oscillators, determine the resonant frequency, simulate the oscillation waveform, and report Q and bandwidth.",
    kind: "analyze",
    desc: "RC tau / LC f0 + Q.",
  },

  // ---- firmware ------------------------------------------------------------
  createPinMapping: {
    key: "createPinMapping",
    label: "Generate pin-mapping header",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Generate a C/C++ pin mapping header file for the microcontroller in this design. Define named constants for each GPIO pin based on the schematic net names and connections. Include comments describing the function of each pin and the connected peripheral.",
    kind: "generate",
    desc: "C header: #define for each GPIO.",
  },
  createFirmwareFile: {
    key: "createFirmwareFile",
    label: "Create firmware file",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Create a firmware project file for {designator}. Read the schematic to identify all GPIO connections, communication buses (I2C, SPI, UART), and peripherals wired to this microcontroller. Document the pin mapping, initialization sequence, and provide a compilable C starter.",
    kind: "generate",
    desc: "C firmware starter from the schematic.",
  },
  generateFirmwareSkeleton: {
    key: "generateFirmwareSkeleton",
    label: "Generate firmware skeleton",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Generate a firmware project skeleton for an embedded system. Include main initialization, GPIO setup, UART debug output, timer configuration, and an interrupt-driven main loop structure. Use clean C code with hardware abstraction for portability.",
    kind: "generate",
    desc: "Generic embedded C skeleton.",
  },

  // ---- datasheet tools (parts agent) --------------------------------------
  readDatasheet: {
    key: "readDatasheet",
    label: "Read datasheet",
    selectionMode: "requireAnyToDesignators",
    submenuGroup: "componentAnalysis",
    prompt:
      "look up the datasheets for {designatorsWithNames} and explain them in detail, including their purpose, key functions, and common applications. Describe how they operate within a circuit and any notable characteristics. Also, explain the family or series these components belong to, highlighting variations, key differences, and applicable use cases.",
    kind: "analyze",
    desc: "Explain a part from its datasheet.",
  },
  findParts: {
    key: "findParts",
    label: "Find parts",
    selectionMode: "none",
    submenuGroup: "componentAnalysis",
    prompt:
      "List out 5 switching regulators that I can use for my project with a maximum output current of 2A. Include key parameters such as input voltage range, output voltage range, switching frequency, efficiency, and package type.",
    kind: "analyze",
    desc: "Search parts by criterion.",
  },
  partSpecifications: {
    key: "partSpecifications",
    label: "Part specifications",
    selectionMode: "requireAnyToDesignator",
    submenuGroup: "componentAnalysis",
    prompt:
      "Extract and summarize all key specifications for this part including: electrical ratings, mechanical dimensions, package type, pin configuration, operating conditions, and any special features or certifications.",
    kind: "analyze",
    desc: "Full spec summary for one part.",
  },
  terminalCharacteristics: {
    key: "terminalCharacteristics",
    label: "Terminal characteristics",
    selectionMode: "requireAnyToDesignator",
    submenuGroup: "componentAnalysis",
    prompt:
      "Extract the electrical characteristics for terminal {designator} on this part, including voltage and current ratings, input/output type, impedance, and any absolute maximum ratings specific to this pin.",
    kind: "analyze",
    desc: "Electrical spec for one pin.",
  },
  operatingConditions: {
    key: "operatingConditions",
    label: "Operating conditions",
    selectionMode: "requireAnyToDesignator",
    submenuGroup: "componentAnalysis",
    prompt:
      "Extract the recommended operating conditions for {designator}. Retrieve key parameters such as supply voltage range, operating temperature range, input/output voltage levels, and other relevant conditions specified for optimal performance.",
    kind: "analyze",
    desc: "Recommended operating window.",
  },

  // ---- snake_case tools (RE'd client surface) -----------------------------
  simulateCircuit: {
    key: "simulateCircuit",
    label: "Simulate circuit",
    selectionMode: "none",
    submenuGroup: "advancedSimulation",
    prompt:
      "Simulate the circuit transient response. Report node voltages and branch currents over time.",
    kind: "analyze",
    tool: {
      name: "simulate_circuit",
      args: {
        tEnd: { type: "number", desc: "s" },
        minStep: { type: "number", desc: "s" },
      },
    },
    desc: "Transient via Shortcircuit.",
  },
  assignFunctionalGroups: {
    key: "assignFunctionalGroups",
    label: "Assign functional groups",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Assign a functional group to every component in this schematic. Give a block to each function a reader of the block diagram needs to see; parts that help another block (protection, memory, level translation, clocking, gating, supervision) join that block.",
    kind: "mutate",
    tool: { name: "assign_functional_groups", args: {} },
    desc: "Tag every part with its functional block.",
  },
  writeProjectDescription: {
    key: "writeProjectDescription",
    label: "Write project description",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Write a concise project description. \n\nKeep it high-level and focus on a functional description of the project as a whole. Retain info from the existing description if it seems relevant. \n\nInclude the new description as a block quote in your reply.",
    kind: "generate",
    tool: { name: "write_project_description", args: {} },
    desc: "One-paragraph functional summary.",
  },
  changeProperty: {
    key: "changeProperty",
    label: "Change property",
    selectionMode: "requireAnyToDesignator",
    submenuGroup: "root",
    prompt: "Double the {propertyName} of {designator}",
    kind: "mutate",
    tool: {
      name: "change_property",
      args: {
        designator: { type: "string", desc: "" },
        property: { type: "string", desc: "" },
        value: { type: "string", desc: "" },
      },
    },
    desc: "Edit a part property.",
  },
  // ---- pcb studio build pipeline ------------------------------------------
  buildPcb: {
    key: "buildPcb",
    label: "Build PCB",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Build this PCB end to end: resolve the schematic netlist, place the footprints, pour copper, autoroute every net, run DRC and generate the fabrication package. Report every failed route or rule by name.",
    kind: "mutate",
    tool: {
      name: "build_pcb",
      args: { gridMM: { type: "number", desc: "router grid in mm" } },
    },
    desc: "Netlist → place → pour → route → DRC → fab.",
  },
  autoPlaceBoard: {
    key: "autoPlaceBoard",
    label: "Auto-place board",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Place every footprint on the board inside the outline with courtyard spacing. Report any part that does not fit.",
    kind: "mutate",
    tool: { name: "auto_place_board", args: {} },
    desc: "Shelf-place all footprints with real courtyards.",
  },
  autorouteBoard: {
    key: "autorouteBoard",
    label: "Autoroute board",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Autoroute every unrouted net on the current board. Use vias where a layer change is required and list every edge that has no legal path.",
    kind: "mutate",
    tool: {
      name: "autoroute_board",
      args: { gridMM: { type: "number", desc: "router grid in mm" } },
    },
    desc: "Two-layer A* routing with vias.",
  },
  runPcbDrc: {
    key: "runPcbDrc",
    label: "Run PCB DRC",
    selectionMode: "none",
    submenuGroup: "detailedReviews",
    prompt:
      "Run the physical PCB design-rule check: clearance, trace width, via size and annular ring, courtyard, silkscreen, board outline, copper connectivity and missing nets. Return each violation with its stable code, location and fix target.",
    kind: "review",
    tool: { name: "run_pcb_drc", args: {} },
    desc: "Physical board DRC with stable codes.",
  },
  exportPcbFabrication: {
    key: "exportPcbFabrication",
    label: "Export fabrication package",
    selectionMode: "none",
    submenuGroup: "manufacturingPrep",
    prompt:
      "Generate the fabrication package: RS-274X Gerbers for every copper/mask/silk layer, Excellon drill, pick-and-place CSV, grouped BOM and a layer-mapping README. Fail named if a required layer is empty.",
    kind: "generate",
    tool: { name: "export_pcb_fabrication", args: {} },
    desc: "Gerbers, drill, CPL, BOM and ZIP.",
  },
  addSchematicSheet: {
    key: "addSchematicSheet",
    label: "Add schematic sheet",
    selectionMode: "none",
    submenuGroup: "root",
    prompt: "Add a new schematic sheet to this PCB project.",
    kind: "mutate",
    tool: {
      name: "add_schematic_sheet",
      args: { name: { type: "string", desc: "sheet name" } },
    },
    desc: "Create a sheet with navigation + connectivity.",
  },
  addPcbPart: {
    key: "addPcbPart",
    label: "Add PCB library part",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Place a footprint from the local PCB library on this board and give it the next free designator.",
    kind: "mutate",
    tool: {
      name: "add_pcb_part",
      args: {
        libraryId: { type: "string", desc: "library part id" },
        designator: { type: "string", desc: "optional designator" },
      },
    },
    desc: "Place a real footprint with pads and silk.",
  },
  addPcbVia: {
    key: "addPcbVia",
    label: "Add PCB via",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Add a plated through via on the requested net at the given board coordinates.",
    kind: "mutate",
    tool: {
      name: "add_pcb_via",
      args: {
        net: { type: "string", desc: "net name" },
        x: { type: "number", desc: "mm" },
        y: { type: "number", desc: "mm" },
      },
    },
    desc: "Drop a real via with drill + annular ring.",
  },
  checkPcbAssembly: {
    key: "checkPcbAssembly",
    label: "Check 3D board assembly",
    selectionMode: "none",
    submenuGroup: "detailedReviews",
    prompt:
      "Check the 3D board assembly: extrude the board, place every component model, compare component heights against the enclosure lid and report collisions with a measured depth.",
    kind: "review",
    tool: {
      name: "check_pcb_assembly",
      args: {
        cavityMM: { type: "number", desc: "cavity height" },
        wallMM: { type: "number", desc: "enclosure wall" },
      },
    },
    desc: "Component/enclosure collision report.",
  },
  createPcbDemo: {
    key: "createPcbDemo",
    label: "Load PCB demo",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Load the two-sheet controller demo, build the board, route it, run DRC and generate the fabrication package.",
    kind: "generate",
    tool: { name: "create_pcb_demo", args: {} },
    desc: "Two-sheet demo with a clean, routed board.",
  },

  // ---- mcad (board ↔ enclosure co-design) ---------------------------------
  importPart: {
    key: "importPart",
    label: "Import part (MCAD)",
    selectionMode: "none",
    submenuGroup: "root",
    prompt: "Import a mechanical part (STEP/STL/SCAD) into this assembly.",
    kind: "mutate",
    tool: {
      name: "import_part",
      args: {
        format: { type: "string", desc: "step|stl|scad" },
        source: { type: "string", desc: "path or url" },
      },
    },
    desc: "Pull a mechanical part into the assembly.",
  },
  exportAssembly: {
    key: "exportAssembly",
    label: "Export assembly (STEP)",
    selectionMode: "none",
    submenuGroup: "root",
    prompt:
      "Export this assembly (board + enclosure + fasteners) as a single STEP document.",
    kind: "generate",
    tool: {
      name: "export_assembly",
      args: {
        name: { type: "string", desc: "file base name" },
        includePcb: { type: "string", desc: "true|false" },
      },
    },
    desc: "STEP the whole device, not just the board.",
  },
  followBoard: {
    key: "followBoard",
    label: "Enclosure follows board",
    selectionMode: "requireAnyToDesignator",
    submenuGroup: "root",
    prompt:
      "Make {designator} (the enclosure) follow the board: recompute the cavity from the board outline + standoffs.",
    kind: "mutate",
    tool: { name: "follow_board", args: {} },
    desc: "Parameterised: enclosure tracks the board outline.",
  },
  followEnclosure: {
    key: "followEnclosure",
    label: "Board follows enclosure",
    selectionMode: "requireAnyToDesignator",
    submenuGroup: "root",
    prompt:
      "Make {designator} (the board) follow the enclosure: clamp mounting holes to the enclosure's screw pattern, drop out-of-bylines parts.",
    kind: "mutate",
    tool: { name: "follow_enclosure", args: {} },
    desc: "Parameterised: board conforms to the mechanical envelope.",
  },
};
// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export const ALL_ACTIONS: PromptAction[] = Object.values(PROMPT_REGISTRY);

export function getAction(key: string): PromptAction | undefined {
  return PROMPT_REGISTRY[key];
}

export const VALID_ACTION_KEYS: readonly string[] = ALL_ACTIONS.map(
  (a) => a.key,
);

/**
 * The menu tree: submenuGroup -> ordered actions. Mirrors flux's copilot menu
 * so the desk dropdown and the VR radial pick identical content.
 */
export function menuByGroup(): Record<SubmenuGroup, PromptAction[]> {
  const out: Record<SubmenuGroup, PromptAction[]> = {
    root: [],
    addSubcircuit: [],
    componentAnalysis: [],
    detailedReviews: [],
    manufacturingPrep: [],
    advancedSimulation: [],
  };
  for (const a of ALL_ACTIONS) out[a.submenuGroup].push(a);
  return out;
}

/** Top-level items only (group "root"), the ones shown in the first tier. */
export function topLevelActions(): PromptAction[] {
  return ALL_ACTIONS.filter((a) => a.submenuGroup === "root");
}

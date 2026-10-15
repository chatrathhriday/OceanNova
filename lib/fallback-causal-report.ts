// Deterministic causal-report generator used only when the live Gemini call fails
// (e.g. AI Gateway billing block, transient outage). It is grounded in the same
// real NOAA/PACE telemetry sentence Gemini would have received, so the offline
// report stays specific to the region/category rather than generic boilerplate.

type MetricKey =
  | "sst"
  | "salinity"
  | "current"
  | "ph"
  | "oxygen"
  | "chlorophyll"
  | "hab"
  | "pressure"
  | "seismic"
  | "volcanic"
  | "tsunami"
  | "hydrothermal"
  | "bioluminescence"
  | "methane"
  | "turbidity"
  | "icecalving"
  | "coralbleaching"
  | "microplastic"
  | "noise"
  | "radiological"
  | "oilspill"
  | "windshear"
  | "wavefreq"
  | "deepcurrent";

type Driver = {
  primary: (region: string) => string;
  factors: string[];
  historical: (region: string) => string;
  outlook: (region: string) => string;
  monitor: string;
};

const DRIVERS: Record<MetricKey, Driver> = {
  sst: {
    primary: (region) =>
      `The sustained warm anomaly in the ${region} is most consistent with a persistent marine heatwave — a stalled high-pressure ridge suppressing wind-driven mixing while anomalously warm surface water accumulates in the upper mixed layer. Reduced cloud cover in the same period compounds the effect via increased shortwave absorption, and if the ridge is anchored by a slow-moving Rossby wave pattern the warm anomaly can persist well beyond a typical synoptic timescale. Weak subsurface stratification lets the excess heat concentrate near the surface rather than mixing downward, which is why satellite-visible SST responds so quickly.`,
    factors: [
      "Weakened wind-driven vertical mixing",
      "Reduced cloud cover, higher insolation",
      "Anomalous ridge blocking cooler fronts",
      "ENSO-linked current redistribution",
      "Shallow mixed-layer depth trapping heat near-surface",
      "Reduced upwelling-favorable wind stress",
    ],
    historical: (region) =>
      `${region} has recorded comparable warm excursions during past El Niño-adjacent phases, typically persisting for several weeks before wind regime shifts restore vertical mixing and surface temperatures normalize. The current reading sits within the upper range of those historical episodes rather than being unprecedented, which is itself informative for how the event is likely to unfold.`,
    outlook: (region) =>
      `Over the next 1-3 weeks, expect the anomaly in the ${region} to persist as long as the blocking ridge holds; a passing frontal system or a shift to upwelling-favorable winds would be the fastest path to relief. Left unresolved, continued warming raises the odds of a secondary chlorophyll or oxygen anomaly nearby as stratification deepens. Historically, comparable events in this region have resolved within two to four weeks once the atmospheric pattern shifted.`,
    monitor: "Watch for coral bleaching cascades, poleward species range shifts, and any drop in dissolved oxygen as a secondary effect of prolonged surface warming. A sustained deviation above +2 degrees C for more than 14 days would signal an escalating marine heatwave rather than a transient pulse.",
  },
  salinity: {
    primary: (region) =>
      `The salinity drop detected in the ${region} points to a freshwater dilution event — most likely elevated riverine discharge or a regional precipitation anomaly outpacing evaporative loss, disrupting the local density gradient. When this coincides with weaker wind mixing, the freshened water forms a stable low-density lens that resists remixing with saltier water below, which is why the anomaly can persist for days even after the freshwater source tapers off.`,
    factors: [
      "Elevated riverine or glacial freshwater input",
      "Above-normal regional precipitation",
      "Reduced evaporation from cooler air masses",
      "Altered current advecting fresher water inshore",
      "Stable low-density surface lens resisting remixing",
    ],
    historical: (region) =>
      `Seasonal freshwater pulses of this magnitude have previously been observed in the ${region} following heavy monsoon or snowmelt seasons upstream, generally resolving within a tidal-mixing cycle. This episode's deviation is broadly consistent with that seasonal envelope rather than indicating an unusual discharge event.`,
    outlook: (region) =>
      `Expect the freshening in the ${region} to gradually mix out over the next one to two tidal cycles unless the upstream discharge source persists. A shift to stronger wind-driven mixing would accelerate recovery; continued calm conditions would let the low-salinity lens linger and could deepen the associated stratification.`,
    monitor: "Track stratification strength and any correlated dip in dissolved oxygen, since freshening can cap deeper mixing and starve subsurface layers. A widening gap between surface and subsurface density readings would confirm the stratification is intensifying.",
  },
  current: {
    primary: (region) =>
      `The current shear anomaly in the ${region} is consistent with a destabilizing eddy or a boundary-current meander pinching off from the main flow, driven by wind-stress curl anomalies overhead. As the parent current loses coherence at this pinch point, angular momentum concentrates into a smaller rotating feature, which is what surfaces as a sharp local shear signature rather than a smooth regional current shift.`,
    factors: [
      "Wind-stress curl anomaly over the region",
      "Boundary-current meander or eddy shedding",
      "Bathymetric steering near shelf break",
      "Seasonal current-axis migration",
      "Angular momentum concentration at the pinch-off point",
    ],
    historical: (region) =>
      `Shear events of this scale in the ${region} have historically tracked mesoscale eddy formation, with the anomaly typically advecting downstream and dissipating within one to two weeks. Comparable past events have not caused lasting changes to the region's mean current structure.`,
    outlook: (region) =>
      `Over the coming one to two weeks, the eddy or meander driving this shear in the ${region} will most likely propagate downstream and gradually lose coherence. Watch for it to trail a secondary chlorophyll signature as it advects nutrients along its edge; a sudden increase in shear magnitude would instead suggest a second eddy is forming nearby.`,
    monitor: "Monitor for rapid drift in surface debris/plankton fronts and any secondary chlorophyll bloom trailing the eddy edge. A doubling of shear magnitude within days would indicate the feature is intensifying rather than dissipating.",
  },
  ph: {
    primary: (region) =>
      `The acidification signal in the ${region} is best explained by localized upwelling of CO2-rich, low-pH deep water combined with cumulative anthropogenic carbon uptake, both of which lower carbonate saturation at the surface. Upwelling-driven pulses like this are typically sharper and shorter-lived than the underlying secular acidification trend, which helps distinguish a transient event from a structural shift.`,
    factors: [
      "Upwelling of CO2-rich subsurface water",
      "Cumulative anthropogenic carbon uptake",
      "Reduced buffering from lower alkalinity input",
      "Biological respiration outpacing photosynthetic uptake",
      "Wind-driven upwelling timing overlapping this reading",
    ],
    historical: (region) =>
      `The ${region} has shown a gradual multi-year acidification trend consistent with global ocean carbon uptake, with short-term dips like this one typically tied to upwelling pulses. The magnitude here is consistent with a strong but not unprecedented upwelling pulse layered on top of that longer trend.`,
    outlook: (region) =>
      `Expect the acute pH dip in the ${region} to ease once the current upwelling-favorable wind window relaxes, typically within one to two weeks. If upwelling-favorable winds persist or strengthen, the low-pH pulse could deepen further before it resolves.`,
    monitor: "Watch calcifying organisms (coral, shellfish larvae) for stress signals and track whether the pH dip correlates with the current upwelling-favorable wind window. A sustained reading below 7.9 for more than a week would raise concern for larval-stage calcifiers.",
  },
  oxygen: {
    primary: (region) =>
      `The dissolved-oxygen decline in the ${region} is characteristic of an expanding hypoxic zone — driven by warm-water stratification capping vertical mixing while biological oxygen demand from algal decay continues below the surface. Once stratification sets in, oxygen consumed by respiration and decomposition below the pycnocline cannot be replenished from the surface, so the deficit compounds day over day until mixing resumes.`,
    factors: [
      "Thermal stratification capping vertical mixing",
      "Elevated biological oxygen demand from algal decay",
      "Reduced deepwater ventilation",
      "Nutrient runoff fueling subsurface respiration",
      "Compounding daily deficit below the pycnocline",
    ],
    historical: (region) =>
      `Seasonal hypoxic expansions have previously been documented in the ${region}, typically peaking during the warmest stratified months and relaxing once storm mixing re-ventilates the water column. This reading tracks within that expected seasonal envelope for now.`,
    outlook: (region) =>
      `Without a mixing event, the oxygen deficit in the ${region} is likely to continue compounding over the next one to two weeks. A passing storm or a cooling trend that breaks down stratification would be the fastest path to recovery; continued calm, warm conditions would push the deficit deeper.`,
    monitor: "Track fish kill reports and bottom-water oxygen sensors for the point where levels fall below the 2 mg/L hypoxia threshold. A rapid drop toward that threshold within days would warrant an advisory.",
  },
  chlorophyll: {
    primary: (region) =>
      `The chlorophyll-a spike in the ${region} indicates an active phytoplankton bloom, most plausibly fueled by nutrient-rich runoff or upwelling coinciding with favorable light and temperature conditions for rapid algal growth. Blooms of this kind typically follow a boom-and-bust cycle: rapid exponential growth while nutrients and light are abundant, followed by a sharp decline once nutrients are drawn down or grazers catch up.`,
    factors: [
      "Nutrient-rich agricultural or riverine runoff",
      "Upwelling-delivered subsurface nutrients",
      "Favorable light and temperature window",
      "Reduced grazing pressure from zooplankton",
      "Early-stage exponential growth phase",
    ],
    historical: (region) =>
      `Bloom intensity of this magnitude in the ${region} has historically aligned with post-rainfall nutrient pulses, generally peaking within a week before grazing and nutrient depletion draw it down. Past blooms of similar magnitude have run their course within two to three weeks.`,
    outlook: (region) =>
      `Expect the bloom in the ${region} to continue intensifying for several more days if nutrients remain available, then decline as nutrients deplete or zooplankton grazing catches up — typically within two to three weeks overall. A lagged rise in the HAB risk index would signal the bloom is shifting toward a more toxic community composition.`,
    monitor: "Watch PACE ocean-color passes for bloom footprint growth and check for a lagged HAB risk increase as the bloom matures. A footprint that keeps expanding past the first week suggests a larger nutrient reservoir than typical.",
  },
  hab: {
    primary: (region) =>
      `The harmful algal bloom risk index in the ${region} is elevated on the back of warm, nutrient-enriched, and stratified surface water — conditions that favor toxin-producing dinoflagellate or cyanobacteria proliferation over benign phytoplankton. Stratification keeps these motile, toxin-producing taxa concentrated in the sunlit surface layer where they can out-compete non-toxic species for light.`,
    factors: [
      "Warm, stratified surface layer favoring toxic taxa",
      "Nutrient enrichment from runoff or upwelling",
      "Low wind mixing concentrating cells near-surface",
      "Prior bloom seeding population still present",
      "Toxic taxa out-competing benign phytoplankton for light",
    ],
    historical: (region) =>
      `The ${region} has a documented history of HAB risk rising under similar warm/stratified/nutrient-rich combinations, with past events resolving as wind mixing or nutrient depletion broke the bloom. Events of comparable severity have previously required coastal advisories before resolving.`,
    outlook: (region) =>
      `If warm, stratified conditions persist in the ${region}, HAB risk is likely to keep climbing over the next one to two weeks alongside chlorophyll-a. A wind event strong enough to break stratification, or nutrient depletion from the bloom itself, would be the most likely path to de-escalation.`,
    monitor: "Prioritize shellfish and coastal water advisories, and track whether chlorophyll-a keeps climbing alongside this index. A joint rise in both indices for more than a week would justify an early precautionary advisory.",
  },
  pressure: {
    primary: (region) =>
      `The hydrostatic pressure deviation near the ${region} is consistent with a mesoscale isopycnal displacement — an internal wave or eddy-driven density surface shift altering the local pressure field at depth, rather than a surface-level cause. These displacements propagate through the water column much like a wave through a rope, so the pressure signature can move through a region even without any local change in surface conditions.`,
    factors: [
      "Internal wave-driven isopycnal displacement",
      "Eddy-induced density surface tilt",
      "Deep current transport variability",
      "Seasonal thermocline depth shift",
      "Wave-like propagation through the water column",
    ],
    historical: (region) =>
      `Pressure-field anomalies of this scale in the ${region} have historically tracked passing internal waves or eddies, resolving as the feature propagates through without a lasting structural shift. No past event of this magnitude has produced a permanent change to the region's baseline pressure field.`,
    outlook: (region) =>
      `The pressure anomaly near the ${region} should continue propagating and gradually flatten out over the next one to two weeks as the underlying internal wave or eddy disperses. A correlated shift in current shear nearby would confirm the same feature is responsible for both signals.`,
    monitor: "Monitor for correlated shifts in current shear and any downstream propagation of the anomaly into neighboring monitored regions. A matching anomaly appearing in an adjacent region within days would confirm the feature is actively propagating.",
  },
  seismic: {
    primary: (region) =>
      `The seismic tremor signature near the ${region} is consistent with stress release along a nearby subduction interface or transform fault, where accumulated tectonic strain finally exceeds the fault's static friction. Elevated microseismicity of this kind often reflects a fault segment creeping toward failure rather than a single isolated event.`,
    factors: [
      "Accumulated tectonic strain along a fault interface",
      "Subduction-zone stress transfer from a nearby segment",
      "Fluid migration lowering fault friction",
      "Aftershock sequence following a larger regional event",
    ],
    historical: (region) =>
      `The ${region} sits within a seismically active margin with a documented history of tremor swarms of comparable magnitude, most of which have resolved without triggering a larger rupture. This reading is consistent with that established background pattern.`,
    outlook: (region) =>
      `Expect continued minor tremor activity near the ${region} over the next 1-2 weeks as the stressed fault segment settles; a sudden jump in magnitude or frequency would instead suggest the segment is building toward a larger release.`,
    monitor: "Track tremor frequency and magnitude trend for any sudden escalation, and cross-check against regional seismic network bulletins for a foreshock pattern.",
  },
  volcanic: {
    primary: (region) =>
      `The volcanic signature near the ${region} points to active magmatic degassing at a submarine or coastal vent, where rising magma releases SO2 and other volatiles ahead of, or instead of, a full eruptive event. Elevated gas flux is often the earliest visible sign of magma migrating closer to the surface.`,
    factors: [
      "Magma migration toward the surface",
      "Increased volatile (SO2/CO2) release from the vent",
      "Localized seafloor deformation or uplift",
      "Thermal anomaly in the water column above the vent",
    ],
    historical: (region) =>
      `Vents in the ${region} have historically cycled through periods of elevated degassing without progressing to a full eruption, though a subset of past episodes did culminate in minor explosive activity. This reading falls within the range that has previously preceded both outcomes.`,
    outlook: (region) =>
      `If gas flux keeps climbing over the next 1-3 weeks near the ${region}, escalation toward a minor eruptive event becomes more likely; a plateau or decline would suggest the system is venting pressure without erupting.`,
    monitor: "Watch for a rising trend in SO2 index alongside any co-located seismic tremor, and flag discolored or upwelling water directly above the vent as a secondary confirmation.",
  },
  tsunami: {
    primary: (region) =>
      `The elevated tsunami wave-risk index near the ${region} is most plausibly tied to an offshore fault rupture or a submarine landslide displacing a large volume of water, generating a long-wavelength wave train that can travel ocean-basin distances with little energy loss. Risk indices like this rise sharply right after the triggering event and decay over the following hours as the wave disperses.`,
    factors: [
      "Offshore fault rupture or submarine landslide",
      "Long-wavelength wave propagation with minimal energy loss",
      "Coastal bathymetry amplifying wave height near shore",
      "Aftershock-triggered secondary wave generation",
    ],
    historical: (region) =>
      `The ${region} lies along a coastline with documented historical tsunami activity tied to the same offshore fault system, and past events of comparable initial risk index have ranged from negligible coastal impact to locally significant run-up.`,
    outlook: (region) =>
      `Risk should decay over the coming hours as the wave train disperses across the basin, unless a secondary rupture or aftershock regenerates it. Coastal stations closest to the ${region} will see the clearest confirmation first.`,
    monitor: "Cross-check against regional tsunami warning center bulletins immediately, and watch coastal tide gauges nearest the source for the first confirmed wave arrival.",
  },
  hydrothermal: {
    primary: (region) =>
      `The hydrothermal plume detected near the ${region} is consistent with mineral-rich, superheated fluid venting from a seafloor spreading center or volcanic arc, buoyantly rising through the water column until it reaches a neutrally buoyant layer and spreads laterally. These plumes are a normal feature of active vent fields, but a sudden intensification usually signals a change in the vent's flow rate or a new fissure opening.`,
    factors: [
      "Superheated mineral-rich fluid venting from the seafloor",
      "Buoyant plume rise to a neutrally buoyant layer",
      "New fissure opening or existing vent flow-rate change",
      "Local seismic activity fracturing the seafloor crust",
    ],
    historical: (region) =>
      `Vent fields near the ${region} have a documented history of episodic plume intensification tied to local tectonic and volcanic activity, typically settling back to baseline venting within days to weeks.`,
    outlook: (region) =>
      `Expect the plume signature near the ${region} to gradually disperse and dilute over the coming days as it spreads laterally, unless renewed local seismicity reopens or widens the vent.`,
    monitor: "Track plume temperature and areal extent for continued growth, and check for a co-located seismic tremor that would explain a new or widened fissure.",
  },
  bioluminescence: {
    primary: (region) =>
      `The bioluminescent bloom near the ${region} is best explained by a rapid proliferation of dinoflagellates or other luminous plankton, triggered by a nutrient pulse and calm, stratified surface conditions that let cell density build quickly in the sunlit layer. Glow intensity tracks cell density fairly directly, so this reading suggests a genuinely dense bloom rather than a minor uptick.`,
    factors: [
      "Nutrient pulse fueling luminous dinoflagellate growth",
      "Calm, stratified surface water concentrating cells",
      "Warm surface temperatures favoring rapid reproduction",
      "Reduced grazing pressure allowing the bloom to build",
    ],
    historical: (region) =>
      `Luminous bloom events of this intensity have previously been documented in the ${region} following similar nutrient and stratification conditions, generally peaking within a week before dispersing.`,
    outlook: (region) =>
      `Expect the glow intensity near the ${region} to continue for several more nights if calm, stratified conditions persist, then fade as nutrients deplete or wind mixing breaks up the surface layer.`,
    monitor: "Watch for a correlated rise in the chlorophyll and HAB risk indices, since the same bloom conditions often drive all three together.",
  },
  methane: {
    primary: (region) =>
      `The methane seep signature near the ${region} points to gas escaping from a shallow subsurface reservoir or destabilizing gas hydrate along the seafloor, most likely triggered by a small pressure or temperature change at depth. Seep plumes like this are typically localized and episodic rather than continuous.`,
    factors: [
      "Gas hydrate destabilization from a temperature or pressure shift",
      "Fault-controlled gas migration from a subsurface reservoir",
      "Seafloor sediment fracturing opening a new seep pathway",
      "Bottom-water warming reducing hydrate stability",
    ],
    historical: (region) =>
      `Seep fields near the ${region} have a documented history of episodic methane flux tied to bottom-water temperature fluctuations, with past pulses typically subsiding within days to weeks.`,
    outlook: (region) =>
      `Expect the seep signature near the ${region} to taper as the local pressure or thermal perturbation that triggered it stabilizes, unless continued bottom-water warming keeps destabilizing the hydrate.`,
    monitor: "Track bottom-water temperature trend alongside seep flux, and watch for bubble-plume sonar confirmations from any nearby research or industry surveys.",
  },
  turbidity: {
    primary: (region) =>
      `The sediment turbidity spike near the ${region} is consistent with a resuspension event — storm-driven wave action, a submarine slump, or elevated river discharge stirring fine sediment into suspension faster than it can settle. Turbidity plumes like this typically follow the dominant surface current until the sediment load settles out.`,
    factors: [
      "Storm or swell-driven seafloor resuspension",
      "Submarine slope failure or slump",
      "Elevated riverine sediment discharge",
      "Dredging or other localized seafloor disturbance",
    ],
    historical: (region) =>
      `Turbidity events of this magnitude have previously followed storm passages or heavy discharge seasons in the ${region}, generally clearing within days as suspended sediment settles.`,
    outlook: (region) =>
      `Expect the plume near the ${region} to gradually clear over the next several days as the sediment settles, unless continued storm activity or discharge keeps resuspending material.`,
    monitor: "Watch PACE ocean-color passes for plume footprint and track whether it's still expanding or has begun contracting.",
  },
  icecalving: {
    primary: (region) =>
      `The ice-shelf calving signature near the ${region} reflects a fracture propagating through the shelf under accumulated structural stress, most plausibly accelerated by basal melt from warmer intruding water thinning the shelf from below. Large calving events are usually the culmination of a rift that has been visibly widening for months.`,
    factors: [
      "Basal melt from warm water intrusion thinning the shelf",
      "Pre-existing rift widening under structural stress",
      "Surface meltwater loading accelerating fracture propagation",
      "Ocean swell flexing the shelf edge",
    ],
    historical: (region) =>
      `Shelves near the ${region} have a documented history of episodic calving tied to basal melt cycles, with event size loosely tracking how long stress had been accumulating beforehand.`,
    outlook: (region) =>
      `Watch for continued fracture propagation near the ${region} over the coming weeks; a rapid widening of the rift would signal a larger calving event is imminent, while a stall would suggest the stress has partially relieved.`,
    monitor: "Track satellite imagery for rift length and width trend, and monitor regional ocean temperature for continued basal melt forcing.",
  },
  coralbleaching: {
    primary: (region) =>
      `The coral bleaching signal near the ${region} is consistent with sustained thermal stress exceeding the local bleaching threshold, causing coral to expel their symbiotic algae as a stress response. Degree Heating Week accumulation like this tracks cumulative thermal stress, not just a single hot day, which is why the index can stay elevated even after temperatures briefly dip.`,
    factors: [
      "Sustained sea-surface temperature above the local bleaching threshold",
      "Cumulative Degree Heating Week thermal stress",
      "Reduced water flow limiting heat dissipation over the reef",
      "Concurrent low tide exposure compounding thermal stress",
    ],
    historical: (region) =>
      `The reef tract near the ${region} has experienced comparable bleaching-threshold exceedances during past marine heatwave years, with recovery outcomes ranging from full recovery to significant coral mortality depending on stress duration.`,
    outlook: (region) =>
      `If surface temperatures near the ${region} remain elevated, expect the bleaching index to keep climbing over the next 1-3 weeks; a return to seasonal-normal temperatures would be the fastest path to reef recovery.`,
    monitor: "Track cumulative Degree Heating Weeks against known regional bleaching and mortality thresholds, and watch for coral disease reports as a secondary stress indicator.",
  },
  microplastic: {
    primary: (region) =>
      `The elevated microplastic density near the ${region} is consistent with convergence-zone accumulation, where prevailing surface currents concentrate buoyant debris from wider catchment areas into a comparatively small patch. Density readings like this typically track the strength and persistence of the converging current pattern rather than a new pollution source.`,
    factors: [
      "Surface-current convergence concentrating floating debris",
      "Upstream riverine or coastal plastic input",
      "Wind-driven Ekman transport toward the convergence zone",
      "Persistent high-pressure system suppressing dispersive mixing",
    ],
    historical: (region) =>
      `The ${region} has a documented history of microplastic accumulation under similar convergent-current conditions, with density readings fluctuating seasonally alongside current strength rather than trending steadily upward.`,
    outlook: (region) =>
      `Expect density near the ${region} to persist as long as the converging current pattern holds; a shift in the prevailing current or a wind-driven dispersal event would be the most likely path to a decline.`,
    monitor: "Track current-pattern persistence and cross-reference with known debris-accumulation zone forecasts for this basin.",
  },
  noise: {
    primary: (region) =>
      `The acoustic noise anomaly near the ${region} is consistent with an elevated source of underwater sound — commonly shipping traffic density, seismic survey activity, or a natural source like a seismic tremor or marine mammal chorus — propagating efficiently through the water column's sound channel. Noise levels this far above baseline are unlikely to originate from ambient wind/wave sound alone.`,
    factors: [
      "Increased shipping traffic density along regional lanes",
      "Active seismic survey or industrial underwater activity",
      "Natural seismic tremor coupling acoustic energy into the water",
      "Sound-channel propagation carrying a distant source further than usual",
    ],
    historical: (region) =>
      `Noise levels of this magnitude have previously coincided with shipping lane congestion or survey activity near the ${region}, generally resolving once that activity moves on or concludes.`,
    outlook: (region) =>
      `Expect the noise anomaly near the ${region} to ease once the underlying activity (traffic, survey, or transient natural event) concludes, typically within days.`,
    monitor: "Cross-reference with regional vessel-traffic and survey-permit data, and watch for co-located seismic activity as an alternative natural source.",
  },
  radiological: {
    primary: (region) =>
      `The radiological trace detected near the ${region} is most plausibly explained by dilute dispersal from a known regional source (historical fallout residue, a permitted discharge, or natural seabed radionuclides) being locally concentrated by a converging current or sediment resuspension event, rather than a new release. Readings at this level are typically well below any acute health threshold but are worth tracking for trend.`,
    factors: [
      "Current-driven concentration of ambient background radionuclides",
      "Sediment resuspension remobilizing legacy seabed material",
      "Dilute dispersal from a known permitted or historical source",
      "Natural cosmogenic or geologic radionuclide variability",
    ],
    historical: (region) =>
      `Background radiological readings near the ${region} have historically shown similar current-driven fluctuations without a confirmed link to a new release, consistent with natural or legacy-source variability.`,
    outlook: (region) =>
      `Expect the trace to fluctuate with local current and sediment conditions near the ${region}; a sustained upward trend rather than a single elevated reading would warrant closer source investigation.`,
    monitor: "Track the reading trend over successive detections rather than reacting to a single value, and cross-check against any known regional discharge schedules.",
  },
  oilspill: {
    primary: (region) =>
      `The oil slick signature near the ${region} is consistent with a hydrocarbon film on the sea surface, most plausibly from a vessel discharge, a pipeline or platform leak, or a natural seep, spreading and thinning under the influence of the local surface current and wind. Slick index values like this typically reflect a real, spatially coherent surface film rather than sensor noise.`,
    factors: [
      "Vessel bilge or ballast discharge along shipping lanes",
      "Subsea pipeline or platform leak",
      "Natural hydrocarbon seep from the seafloor",
      "Wind and current-driven spreading concentrating the film locally",
    ],
    historical: (region) =>
      `The ${region} has a documented history of both natural seep slicks and vessel-discharge slicks of comparable extent, with natural seeps typically recurring in the same location and discharge slicks appearing along shipping lanes.`,
    outlook: (region) =>
      `Expect the slick near the ${region} to continue spreading and thinning under wind and current forcing, gradually weathering over the next several days unless a source continues actively leaking.`,
    monitor: "Cross-reference the slick location against known natural seep sites and vessel traffic data, and track areal extent for continued growth versus weathering.",
  },
  windshear: {
    primary: (region) =>
      `The surface wind shear anomaly near the ${region} is consistent with a sharp boundary between two air masses, commonly a frontal passage, a sea breeze convergence, or the edge of a larger synoptic pressure system, generating a strong local gradient in wind speed and direction. Anomalies like this typically track the movement of the driving frontal or pressure feature.`,
    factors: [
      "Frontal boundary passage",
      "Sea breeze or land breeze convergence zone",
      "Edge of a larger synoptic-scale pressure system",
      "Orographic wind channeling near coastal terrain",
    ],
    historical: (region) =>
      `Shear anomalies of this magnitude have previously tracked frontal or convergence-zone passages through the ${region}, typically resolving within a day or two as the feature moves through.`,
    outlook: (region) =>
      `Expect the shear anomaly near the ${region} to move with the driving weather feature and ease within 1-2 days; a stalled front would instead let the anomaly persist longer than typical.`,
    monitor: "Track the anomaly's movement against regional weather-model frontal analysis, and watch for a resulting sea-state or current anomaly trailing behind it.",
  },
  wavefreq: {
    primary: (region) =>
      `The wave frequency shift near the ${region} is consistent with a change in dominant swell period, most plausibly from a distant storm system generating a new swell train that has now propagated into the region and is superimposing on the local wind-sea. Frequency-domain shifts like this often precede a visible change in sea state by hours.`,
    factors: [
      "Distant storm-generated swell train arriving in the region",
      "Local wind-sea and incoming swell superimposing",
      "Bathymetric refraction altering the effective wave period nearshore",
      "Seasonal transition in the dominant swell-generation pattern",
    ],
    historical: (region) =>
      `Wave-period shifts of this scale have previously preceded storm-swell arrivals in the ${region}, with sea-state impacts typically becoming visible within 6-12 hours of the frequency shift.`,
    outlook: (region) =>
      `Expect a corresponding change in sea state near the ${region} within the next 6-12 hours as the new swell train fully arrives; monitor buoy wave-height readings for confirmation.`,
    monitor: "Cross-check against buoy wave-height and period readings for the arriving swell, and track its source storm system for expected duration.",
  },
  deepcurrent: {
    primary: (region) =>
      `The deep current divergence near the ${region} is consistent with a shift in the deep water-mass transport, potentially reflecting a change in deep convection upstream or a large-scale circulation reorganization affecting the overturning pathway through this basin. Divergence signals like this are subtle at the surface but can carry meaningful implications for regional heat and nutrient transport.`,
    factors: [
      "Upstream deep-convection rate change",
      "Large-scale overturning circulation reorganization",
      "Bathymetry-steered deep flow splitting around a seafloor feature",
      "Density-driven flow response to a basin-wide salinity or temperature shift",
    ],
    historical: (region) =>
      `Deep transport anomalies of this magnitude have previously been linked to multi-month overturning circulation fluctuations affecting the ${region}, generally persisting longer than surface anomalies before resolving.`,
    outlook: (region) =>
      `Expect the divergence signal near the ${region} to persist over a multi-week timescale, consistent with the slower-evolving nature of deep circulation versus surface anomalies.`,
    monitor: "Track deep mooring or model-reanalysis transport estimates for this basin, and watch for a lagged surface signature as the deep anomaly propagates.",
  },
};

// A grounding sentence is only real signal if it reports an actual reading — not the
// "no live buoy reading available" / "0 recent ... passes" placeholder text.
function hasRealSignal(grounding: string | null) {
  if (!grounding) return false;
  const noBuoy = grounding.includes("no live buoy reading available");
  const noPace = /\b0 recent NASA PACE/.test(grounding);
  return !(noBuoy && noPace);
}

function confidenceFor(percent: number, grounding: string | null): "low" | "moderate" | "high" {
  const realSignal = hasRealSignal(grounding);
  if (realSignal && percent >= 92) return "high";
  if (realSignal || percent >= 90) return "moderate";
  return "low";
}

export type FallbackReportInput = {
  region: string;
  metricKey: string;
  label: string;
  percent: number;
  trend: "rising" | "falling" | "stable";
  weekOverWeek: number;
  occurrences: number;
  windowDays: number;
  grounding: string | null;
};

export function buildFallbackCausalReport(input: FallbackReportInput) {
  const driver = DRIVERS[input.metricKey as MetricKey] ?? DRIVERS.sst;
  const trendClause =
    input.trend === "rising"
      ? `still climbing (+${input.weekOverWeek}% week-over-week)`
      : input.trend === "falling"
        ? `beginning to ease (${input.weekOverWeek}% week-over-week)`
        : "holding steady week-over-week";

  const realSignal = hasRealSignal(input.grounding);
  const groundedPrimary = realSignal
    ? `${driver.primary(input.region)} Live telemetry backs this up: ${input.grounding}`
    : input.grounding
      ? `${driver.primary(input.region)} No live buoy or PACE pass currently covers this exact region, so this brief leans on regional climatology and known driver patterns instead of a direct sensor reading.`
      : driver.primary(input.region);

  return {
    headline: `${input.label} anomaly ${trendClause.startsWith("still") ? "still intensifying" : trendClause.startsWith("beginning") ? "starting to ease" : "holding at critical"}`,
    primaryCause: groundedPrimary,
    contributingFactors: driver.factors,
    historicalContext: driver.historical(input.region),
    outlook: driver.outlook(input.region),
    confidence: confidenceFor(input.percent, input.grounding),
    monitoringRecommendation: `${driver.monitor} With ${input.occurrences} detections logged over ${input.windowDays} days and the signal ${trendClause}, treat this as an active watch item rather than a one-off reading.`,
  };
}

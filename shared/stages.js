/** Maps offered by the room. Custom maps are manual-only; mode.stages remains the random pool. */
export function selectableStages(data, modeId) {
  const mode = data?.config?.modes?.[modeId];
  const ids = new Set(Array.isArray(mode?.stages) ? mode.stages : []);
  for (const s of Object.values(data?.stages || {})) {
    if (s?.manualOnly && s.active && s.modes?.includes(modeId)) ids.add(s.id);
  }
  return [...ids].map(id => data?.stages?.[id]).filter(s => s && s.active !== false);
}

export function canSelectStage(data, modeId, stageId) {
  return stageId === null || selectableStages(data, modeId).some(s => s.id === stageId);
}

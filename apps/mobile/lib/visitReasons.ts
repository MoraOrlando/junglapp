import type { ReminderType } from '@junglapp/types';

// Fuente única de verdad de las categorías de visita/registro médico —
// reemplaza las copias que existían en add-visit.tsx, pets/[id].tsx y
// (vet)/appointment/[id].tsx.
//
// 'Control' significa antiparasitario/desparasitación (decisión explícita:
// se repurpuso desde su significado anterior de "control veterinario
// general" — las visitas legacy con este valor no se migran, pero a partir
// de ahora se agrupan como antiparasitario en la UI).
export const VISIT_REASONS = ['Vacunas', 'Control', 'Operación', 'Otro'] as const;

export const VISIT_REASON_ICONS: Record<string, string> = {
  Vacunas: '💉',
  Control: '💊',
  Operación: '🔬',
  Otro: '📋',
};

export type VisitSection = 'vaccine' | 'antiparasitic' | 'general';

// Datos legacy sin visitReason (o con 'Operación'/'Otro') caen en 'general'.
export function getVisitSection(visitReason?: string): VisitSection {
  if (visitReason === 'Vacunas') return 'vaccine';
  if (visitReason === 'Control') return 'antiparasitic';
  return 'general';
}

export function reminderTypeForReason(visitReason?: string): ReminderType {
  const section = getVisitSection(visitReason);
  return section === 'general' ? 'vet_control' : section;
}

export const SECTION_META: Record<VisitSection, { emoji: string; title: string }> = {
  vaccine: { emoji: '💉', title: 'Vacunas' },
  antiparasitic: { emoji: '💊', title: 'Control antiparasitario' },
  general: { emoji: '📋', title: 'Consultas generales' },
};

export const SECTION_ORDER: VisitSection[] = ['vaccine', 'antiparasitic', 'general'];

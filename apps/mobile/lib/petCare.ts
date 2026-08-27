// Orientative care content shown to owners registering a puppy/kitten.
// Vaccine/deworming schedules are standard veterinary guidance by species +
// age — NOT breed-specific — so this is keyed on species only. Breed-specific
// predispositions are out of scope until reviewed by a vet on the platform.
export function getAgeInMonths(birthDateISO: string): number | null {
  if (!birthDateISO) return null;
  const birth = new Date(birthDateISO);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  return Math.max(months, 0);
}

export interface CareInfo {
  emoji: string;
  title: string;
  vaccines: string[];
  deworming: string;
  feeding: string;
  generalCare: string[];
}

// Only covers <3 months (the bracket requested) for dog/cat — the two
// species with a curated breed list. Extending to more age brackets or to
// "other" species should wait for vet-reviewed content.
export const BABY_CARE: Record<'dog' | 'cat', CareInfo> = {
  dog: {
    emoji: '🐶',
    title: 'Cuidados para cachorros (menos de 3 meses)',
    vaccines: [
      'Primera dosis (óctuple/polivalente) entre las 6 y 8 semanas de vida',
      'Refuerzos cada 3-4 semanas hasta completar el esquema, alrededor de las 16 semanas',
      'Antirrábica a partir de los 3 meses',
    ],
    deworming: 'Desparasitación interna cada 2-3 semanas hasta los 3 meses; después, mensual.',
    feeding: 'Alimento formulado para cachorro (puppy), en 3-4 porciones repartidas durante el día.',
    generalCare: [
      'Evita paseos en espacios públicos o contacto con perros no vacunados hasta completar el esquema',
      'Socialización progresiva en ambientes controlados y seguros',
      'Control de peso y crecimiento en cada visita al veterinario',
    ],
  },
  cat: {
    emoji: '🐱',
    title: 'Cuidados para gatitos (menos de 3 meses)',
    vaccines: [
      'Primera dosis (triple felina) entre las 6 y 8 semanas de vida',
      'Refuerzos cada 3-4 semanas hasta completar el esquema, alrededor de las 16 semanas',
      'Antirrábica a partir de los 3 meses',
    ],
    deworming: 'Desparasitación interna cada 2-3 semanas hasta los 3 meses.',
    feeding: 'Alimento formulado para gatito (kitten), en porciones pequeñas y frecuentes.',
    generalCare: [
      'Arenero limpio y siempre accesible',
      'Evita el contacto con gatos sin esquema de vacunas completo',
      'Ambiente tranquilo para facilitar la socialización',
    ],
  },
};

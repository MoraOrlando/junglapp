import { View, Text, TouchableOpacity } from 'react-native';

export type AccountPlan = 'free' | 'light' | 'pro';

const PLANS: { id: AccountPlan; emoji: string; name: string; desc: string; color: string; badge?: string }[] = [
  {
    id: 'free',
    emoji: '🌱',
    name: 'Free',
    desc: 'Perfil básico visible en la app',
    color: '#6B7280',
  },
  {
    id: 'light',
    emoji: '⚡',
    name: 'Light',
    desc: 'Más visibilidad y funciones adicionales',
    color: '#2D6A4F',
    badge: 'Popular',
  },
  {
    id: 'pro',
    emoji: '🚀',
    name: 'Pro',
    desc: 'Máxima visibilidad, estadísticas y prioridad',
    color: '#7C3AED',
  },
];

interface Props {
  value: AccountPlan;
  onChange: (plan: AccountPlan) => void;
}

export default function PlanSelector({ value, onChange }: Props) {
  return (
    <View style={{ gap: 10 }}>
      {PLANS.map((plan) => {
        const selected = value === plan.id;
        return (
          <TouchableOpacity
            key={plan.id}
            onPress={() => onChange(plan.id)}
            style={{
              borderRadius: 16,
              borderWidth: 2,
              borderColor: selected ? plan.color : '#E5E7EB',
              backgroundColor: selected ? `${plan.color}12` : '#fff',
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${plan.color}20`, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 22 }}>{plan.emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontWeight: '700', fontSize: 16, color: selected ? plan.color : '#1F2937' }}>
                  {plan.name}
                </Text>
                {plan.badge && (
                  <View style={{ backgroundColor: plan.color, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>{plan.badge}</Text>
                  </View>
                )}
                <Text style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>Gratis</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{plan.desc}</Text>
            </View>
            <View style={{
              width: 22, height: 22, borderRadius: 11,
              borderWidth: 2,
              borderColor: selected ? plan.color : '#D1D5DB',
              backgroundColor: selected ? plan.color : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {selected && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

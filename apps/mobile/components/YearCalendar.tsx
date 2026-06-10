import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Calendar } from 'react-native-calendars';

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface Props {
  onDayPress: (day: { dateString: string }) => void;
  markedDates?: Record<string, any>;
  minDate?: string;
  maxDate?: string;
  initialDate?: string;
  color?: string;
}

/**
 * Calendar with month AND year navigation.
 * ‹‹ / ›› move by year, ‹ / › move by month.
 */
export default function YearCalendar({ onDayPress, markedDates, minDate, maxDate, initialDate, color = '#2D6A4F' }: Props) {
  const [current, setCurrent] = useState(() => {
    const d = initialDate ? new Date(initialDate + 'T00:00:00') : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  function shift(months: number) {
    setCurrent((c) => {
      const d = new Date(c.year, c.month + months, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const currentStr = `${current.year}-${String(current.month + 1).padStart(2, '0')}-01`;

  const NavBtn = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <TouchableOpacity
      onPress={onPress}
      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F3F4F6' }}
    >
      <Text style={{ color, fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View>
      {/* Custom year + month navigation header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 8, paddingVertical: 8, backgroundColor: '#fff',
        borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
      }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <NavBtn label="««" onPress={() => shift(-12)} />
          <NavBtn label="‹" onPress={() => shift(-1)} />
        </View>
        <Text style={{ fontWeight: '700', color: '#1F2937', fontSize: 15 }}>
          {MONTHS[current.month]} {current.year}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <NavBtn label="›" onPress={() => shift(1)} />
          <NavBtn label="»»" onPress={() => shift(12)} />
        </View>
      </View>

      <Calendar
        key={currentStr}
        current={currentStr}
        onDayPress={onDayPress}
        minDate={minDate}
        maxDate={maxDate}
        markedDates={markedDates}
        hideArrows
        renderHeader={() => null}
        onMonthChange={(m: { year: number; month: number }) => setCurrent({ year: m.year, month: m.month - 1 })}
        theme={{ selectedDayBackgroundColor: color, todayTextColor: color, arrowColor: color }}
      />
    </View>
  );
}

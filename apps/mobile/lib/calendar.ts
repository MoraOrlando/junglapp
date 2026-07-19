import * as ExpoCalendar from 'expo-calendar';

// Best-effort: adds a booked appointment/service to the device calendar so it
// shows up alongside the user's other events, not just inside JunglApp.
// Silently no-ops on denied permission or any failure — must never block or
// fail the booking itself.
export async function addAppointmentToDeviceCalendar(
  title: string,
  date: string,
  time: string,
  notes = 'Agendado desde JunglApp'
) {
  try {
    const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') return;
    const calendars = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);
    const defaultCal = calendars.find((c) => c.allowsModifications) ?? calendars[0];
    if (!defaultCal) return;
    const startDate = new Date(`${date}T${time}:00`);
    await ExpoCalendar.createEventAsync(defaultCal.id, {
      title,
      startDate,
      endDate: new Date(startDate.getTime() + 60 * 60 * 1000),
      notes,
      alarms: [{ relativeOffset: -60 }, { relativeOffset: -24 * 60 }],
    });
  } catch {}
}

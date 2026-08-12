<script setup>
import { ref, onMounted, watch } from 'vue';
import FullCalendar from '@fullcalendar/vue3';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import client from '../api/client';

const rooms = ref([]);
const selectedRoomId = ref('');
const myBookings = ref([]);
const error = ref('');
const info = ref('');
const calendarRef = ref(null);

const calendarOptions = ref({
  plugins: [timeGridPlugin, interactionPlugin],
  initialView: 'timeGridWeek',
  selectable: true,
  selectMirror: true,
  slotMinTime: '06:00:00',
  slotMaxTime: '23:00:00',
  events: [],
  select: onSelectSlot,
  eventClick: onEventClick,
  height: 'auto',
});

async function loadRooms() {
  const { data } = await client.get('/rooms');
  rooms.value = data;
  if (data.length && !selectedRoomId.value) {
    selectedRoomId.value = data[0].id;
  }
}

async function loadMyBookings() {
  const { data } = await client.get('/bookings');
  myBookings.value = data;
  refreshEvents();
}

function refreshEvents() {
  calendarOptions.value.events = myBookings.value
    .filter((b) => b.status !== 'cancelled')
    .map((b) => ({
      id: b.id,
      title: `${b.room?.name ?? ''} — ${b.status} (${b.finalPrice} грн)`,
      start: b.startTime,
      end: b.endTime,
      color: b.status === 'confirmed' ? '#2e7d32' : b.status === 'pending' ? '#f9a825' : '#9e9e9e',
    }));
}

// Drag across empty slots in the calendar to create a booking for the
// currently selected room. This is the "drag-and-drop booking" from the plan.
async function onSelectSlot(selectionInfo) {
  error.value = '';
  info.value = '';
  const api = calendarRef.value.getApi();
  api.unselect();

  if (!selectedRoomId.value) {
    error.value = 'Оберіть кімнату';
    return;
  }

  try {
    const { data: booking } = await client.post('/bookings', {
      roomId: selectedRoomId.value,
      startTime: selectionInfo.startStr,
      endTime: selectionInfo.endStr,
    });
    info.value = `Заброньовано за ціною ${booking.finalPrice} грн. Переходимо до оплати...`;
    await loadMyBookings();

    const { data: checkout } = await client.post('/payments/checkout-session', {
      bookingId: booking.id,
    });
    if (checkout.url) {
      window.location.href = checkout.url;
    }
  } catch (e) {
    error.value = e.response?.data?.message ?? 'Не вдалося забронювати слот';
  }
}

async function onEventClick(clickInfo) {
  if (!confirm('Скасувати це бронювання?')) return;
  try {
    await client.delete(`/bookings/${clickInfo.event.id}`);
    await loadMyBookings();
  } catch (e) {
    error.value = e.response?.data?.message ?? 'Не вдалося скасувати';
  }
}

onMounted(async () => {
  await loadRooms();
  await loadMyBookings();
});
</script>

<template>
  <div>
    <h1>Бронювання кімнат</h1>
    <div class="toolbar">
      <label>
        Кімната:
        <select v-model="selectedRoomId">
          <option v-for="room in rooms" :key="room.id" :value="room.id">
            {{ room.name }} ({{ room.capacity }} місць, база {{ room.basePrice }} грн)
          </option>
        </select>
      </label>
    </div>
    <p v-if="info" class="info">{{ info }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p class="hint">Перетягніть по вільному часу в календарі, щоб забронювати обрану кімнату. Клік по бронюванню — скасування.</p>
    <FullCalendar ref="calendarRef" :options="calendarOptions" />
  </div>
</template>

<style scoped>
.toolbar {
  margin-bottom: 0.75rem;
}
.hint {
  color: #666;
  font-size: 0.9rem;
}
.error {
  color: #c0392b;
}
.info {
  color: #2e7d32;
}
</style>

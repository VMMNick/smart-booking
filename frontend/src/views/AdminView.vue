<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';
import Chart from 'chart.js/auto';
import client from '../api/client';

const rooms = ref([]);
const selectedRoomId = ref('');
const chartCanvas = ref(null);
let chartInstance = null;

const rules = ref([]);
const newRule = ref({ conditionType: 'time_of_day', multiplier: 1.2, condition: '{}' });
const error = ref('');

async function loadRooms() {
  const { data } = await client.get('/rooms');
  rooms.value = data;
  if (data.length && !selectedRoomId.value) {
    selectedRoomId.value = data[0].id;
  }
}

async function loadOccupancy() {
  if (!selectedRoomId.value) return;
  const { data } = await client.get('/bookings/stats/occupancy', {
    params: { roomId: selectedRoomId.value, days: 14 },
  });
  await nextTick();
  renderChart(data);
}

function renderChart(data) {
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(chartCanvas.value, {
    type: 'bar',
    data: {
      labels: data.map((d) => d.date),
      datasets: [
        {
          label: 'Завантаженість (%)',
          data: data.map((d) => Math.round(d.occupancy * 100)),
          backgroundColor: '#1976d2',
        },
      ],
    },
    options: {
      scales: { y: { beginAtZero: true, max: 100 } },
    },
  });
}

async function loadRules() {
  if (!selectedRoomId.value) return;
  const { data } = await client.get('/pricing-rules', { params: { roomId: selectedRoomId.value } });
  rules.value = data;
}

async function addRule() {
  error.value = '';
  try {
    let condition;
    try {
      condition = JSON.parse(newRule.value.condition);
    } catch {
      throw new Error('Умова має бути валідним JSON, напр. {"from":"18:00","to":"22:00"}');
    }
    await client.post('/pricing-rules', {
      roomId: selectedRoomId.value,
      conditionType: newRule.value.conditionType,
      multiplier: Number(newRule.value.multiplier),
      condition,
    });
    newRule.value = { conditionType: 'time_of_day', multiplier: 1.2, condition: '{}' };
    await loadRules();
  } catch (e) {
    error.value = e.response?.data?.message ?? e.message ?? 'Не вдалося створити правило';
  }
}

async function removeRule(id) {
  await client.delete(`/pricing-rules/${id}`);
  await loadRules();
}

watch(selectedRoomId, () => {
  loadOccupancy();
  loadRules();
});

onMounted(async () => {
  await loadRooms();
  await loadOccupancy();
  await loadRules();
});
</script>

<template>
  <div>
    <h1>Адмін-панель</h1>

    <label>
      Кімната:
      <select v-model="selectedRoomId">
        <option v-for="room in rooms" :key="room.id" :value="room.id">{{ room.name }}</option>
      </select>
    </label>

    <section>
      <h2>Завантаженість за 14 днів</h2>
      <canvas ref="chartCanvas" height="90"></canvas>
    </section>

    <section>
      <h2>Правила ціноутворення</h2>
      <table>
        <thead>
          <tr>
            <th>Тип</th>
            <th>Умова</th>
            <th>Множник</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rule in rules" :key="rule.id">
            <td>{{ rule.conditionType }}</td>
            <td><code>{{ JSON.stringify(rule.condition) }}</code></td>
            <td>{{ rule.multiplier }}</td>
            <td><button @click="removeRule(rule.id)">Видалити</button></td>
          </tr>
        </tbody>
      </table>

      <form class="rule-form" @submit.prevent="addRule">
        <select v-model="newRule.conditionType">
          <option value="time_of_day">time_of_day</option>
          <option value="day_of_week">day_of_week</option>
          <option value="demand">demand</option>
        </select>
        <input v-model="newRule.condition" placeholder='{"from":"18:00","to":"22:00"}' />
        <input v-model="newRule.multiplier" type="number" step="0.1" min="0" />
        <button type="submit">Додати правило</button>
      </form>
      <p v-if="error" class="error">{{ error }}</p>
    </section>
  </div>
</template>

<style scoped>
section {
  margin-top: 2rem;
}
table {
  border-collapse: collapse;
  width: 100%;
  max-width: 640px;
}
th, td {
  border: 1px solid #ddd;
  padding: 0.4rem 0.6rem;
  text-align: left;
}
.rule-form {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.error {
  color: #c0392b;
}
</style>

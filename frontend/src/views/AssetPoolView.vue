<template>
  <section class="content-surface">
    <div class="page-header">
      <span class="badge">Asset-Pool</span>
      <h1 class="page-title">Asset catalog overview</h1>
      <p class="page-subtitle">
        Browse and refine the centralized list of assets. HTTP calls are scoped to
        <strong>{{ apiBase }}</strong> so the UI can talk to the existing Express API layer.
      </p>
    </div>

    <div class="card-grid">
      <div class="card" v-for="highlight in highlights" :key="highlight.title">
        <h3>{{ highlight.title }}</h3>
        <p>{{ highlight.copy }}</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import { apiClient } from '@/services/http';

const apiBase = computed(() => apiClient.defaults.baseURL || '/api');

const highlights = [
  {
    title: 'Searchable inventory',
    copy: 'Pinpoint assets quickly using the same filters that power the server-rendered views.'
  },
  {
    title: 'Editable records',
    copy: 'Keep the data-layer intact while modernizing the UI on top of the existing endpoints.'
  },
  {
    title: 'Navigation parity',
    copy: 'Routes mirror the Handlebars layout to make migration and QA straightforward.'
  }
];
</script>

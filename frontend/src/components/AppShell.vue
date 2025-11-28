<template>
  <div class="app-shell">
    <SiteHeader />
    <main class="app-shell__main">
      <slot />
    </main>
  </div>
</template>

<script setup>
import SiteHeader from './SiteHeader.vue';
</script>

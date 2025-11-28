<template>
  <section class="content-surface">
    <div class="page-header">
      <span class="badge">Umsetzung</span>
      <h1 class="page-title">Implementation dashboard</h1>
      <p class="page-subtitle">
        Track rollout progress and keep navigation consistent across legacy Handlebars and the new Vue
        application.
      </p>
    </div>

    <div class="card-grid">
      <div class="card">
        <h3>Progress tracking</h3>
        <p>Use Pinia to share status between routes when connecting to real APIs.</p>
      </div>
      <div class="card">
        <h3>API ready</h3>
        <p>Axios is configured with a reusable client so calls can be dropped in as endpoints become available.</p>
      </div>
    </div>
  </section>
</template>

<script setup>
</script>

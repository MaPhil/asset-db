<template>
  <nav class="site-nav">
    <RouterLink
      v-for="link in links"
      :key="link.name"
      :to="{ name: link.name }"
      :class="{ active: currentRouteName === link.name }"
    >
      {{ link.label }}
    </RouterLink>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useNavigationStore } from '@/stores/navigation';

const route = useRoute();
const navigation = useNavigationStore();

const links = computed(() => navigation.links);
const currentRouteName = computed(() => route.name);
</script>

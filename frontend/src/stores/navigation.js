import { defineStore } from 'pinia';

export const useNavigationStore = defineStore('navigation', {
  state: () => ({
    links: [
      { name: 'asset-pool', label: 'Asset-Pool' },
      { name: 'asset-structure', label: 'Asset-Struktur' },
      { name: 'measures', label: 'Maßnahmen' },
      { name: 'implementation', label: 'Umsetzung' }
    ]
  })
});

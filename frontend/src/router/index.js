import { createRouter, createWebHistory } from 'vue-router';
import AssetPoolView from '@/views/AssetPoolView.vue';
import AssetStructureView from '@/views/AssetStructureView.vue';
import MeasuresView from '@/views/MeasuresView.vue';
import ImplementationView from '@/views/ImplementationView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: { name: 'asset-pool' }
    },
    {
      path: '/asset-pool',
      name: 'asset-pool',
      component: AssetPoolView
    },
    {
      path: '/asset-structure',
      name: 'asset-structure',
      component: AssetStructureView
    },
    {
      path: '/measures',
      name: 'measures',
      component: MeasuresView
    },
    {
      path: '/implementation',
      name: 'implementation',
      component: ImplementationView
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: 'asset-pool' }
    }
  ]
});

export default router;

import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./views/HomeView.vue'),
    },
    {
      path: '/join',
      name: 'join',
      component: () => import('./views/HomeView.vue'),
    },
    {
      path: '/room/:roomId',
      name: 'room',
      component: () => import('./views/RoomView.vue'),
      props: true,
    },
    {
      path: '/tv',
      name: 'tv-query',
      component: () => import('./views/TvDisplayView.vue'),
    },
    {
      path: '/tv/:roomId',
      name: 'tv',
      component: () => import('./views/TvDisplayView.vue'),
      props: true,
    },
  ],
});

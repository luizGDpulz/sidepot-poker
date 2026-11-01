import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';
import './styles/main.css';
import { initProgressiveFormValidation } from './utils/dom-enhancements.js';

const app = createApp(App);
app.use(router);
app.mount('#app');

if (typeof document !== 'undefined') {
  initProgressiveFormValidation(document);
}

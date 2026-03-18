import { createApp } from "vue";
import App from "./App.vue";
import { createI18nInstance } from "./i18n";

async function bootstrap() {
  const { i18n } = await createI18nInstance();
  const app = createApp(App);
  app.use(i18n);
  app.mount("#app");
}

void bootstrap();


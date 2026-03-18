<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { setLocaleRuntime } from "../../i18n";

type LangItem = { lang: string; display: string };

const { t, locale } = useI18n();

const props = defineProps<{
  initialName: string;
}>();

const emit = defineEmits<{
  (e: "save", name: string): void;
}>();

const name = ref(props.initialName || "");
const savingDisabled = computed(() => name.value.trim().length === 0);

const langs = [
  { lang: "zh-cn", display: "中文" },
  { lang: "en", display: "English" },
] as LangItem[];

const selectedLanguage = ref(() => {
  const raw = window.localStorage.getItem("language") ?? String(locale.value);
  const normalized = String(raw || "").toLowerCase();
  return normalized === "en" || normalized === "zh-cn" ? normalized : "zh-cn";
});

const error = ref(null as string | null);

async function onLanguageChange(value: string) {
  const v = String(value || "").trim();
  if (!v) return;
  await setLocaleRuntime(v);
  selectedLanguage.value = window.localStorage.getItem("language") ?? v;
}

function onSave() {
  error.value = null;
  const v = name.value.trim().replace(/\s+/g, " ");
  if (!v) {
    error.value = t("Persona Name:");
    return;
  }
  emit("save", v);
}

onMounted(() => {});
</script>

<template>
  <div class="backdrop">
    <div class="card">
      <div class="header">
        <div class="title">{{ t('Welcome to SillyTavern!') }}</div>
      </div>

      <div class="row">
        <div class="label">{{ t('UI Language') }}</div>
        <select
          class="select"
          :value="selectedLanguage ?? ''"
          @change="onLanguageChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="">English</option>
          <option v-for="l in langs" :key="l.lang" :value="l.lang">
            {{ l.display }}
          </option>
        </select>
      </div>

      <div class="blurb">
        <b>{{ t('SillyTavern is aimed at advanced users.') }}</b>
        <ul>
          <li>
            {{ t('welcome_message_part_1') }}
            <a class="link" href="https://docs.sillytavern.app/" target="_blank" rel="noreferrer">
              {{ t('welcome_message_part_2') }}
            </a
            >{{ t('welcome_message_part_3') }}
          </li>
          <li>
            {{ t('welcome_message_part_4') }} <code>/help</code>
            {{ t('welcome_message_part_5') }}
          </li>
          <li>
            {{ t('welcome_message_part_6') }}
            <a class="link" href="https://discord.gg/sillytavern" target="_blank" rel="noreferrer">
              {{ t('Discord server') }}
            </a>
            {{ t('welcome_message_part_7') }}
          </li>
        </ul>
      </div>

      <div class="sectionTitle">{{ t('Your Persona') }}</div>
      <div class="blurb">
        <span>{{ t('Before you get started, you must select a persona name.') }}</span>
        <br />
        <span>
          {{ t('welcome_message_part_8') }}
          <code>🙂</code>
          {{ t('welcome_message_part_9') }}
        </span>
      </div>

      <div class="row">
        <div class="label">{{ t('Persona Name:') }}</div>
        <input
          class="input"
          type="text"
          :placeholder="t('Persona Name:')"
          v-model="name"
          @keydown.enter.prevent="onSave"
        />
      </div>

      <div v-if="error" class="error">{{ error }}</div>

      <div class="actions">
        <button class="btnPrimary" :disabled="savingDisabled" @click="onSave">
          {{ t('Save') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: radial-gradient(1200px 800px at 50% 20%, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.92));
  z-index: 9999;
}
.card {
  width: min(720px, 100%);
  border: 1px solid #2a2a2a;
  border-radius: 14px;
  background: rgba(12, 12, 12, 0.92);
  backdrop-filter: blur(10px);
  padding: 18px 18px 16px;
  color: #f3f3f3;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
}
.header {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
.title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 10px;
  align-items: center;
  margin: 10px 0;
}
.label {
  color: #cfcfcf;
  font-size: 13px;
}
.select,
.input {
  width: 100%;
  border-radius: 10px;
  border: 1px solid #2a2a2a;
  background: #0a0a0a;
  color: #f3f3f3;
  padding: 10px 12px;
  outline: none;
}
.select:focus,
.input:focus {
  border-color: #3a3a3a;
}
.blurb {
  color: #d8d8d8;
  font-size: 13px;
  line-height: 1.5;
  margin: 8px 0 12px;
}
.blurb ul {
  margin: 8px 0 0;
  padding-left: 18px;
}
.blurb li {
  margin: 4px 0;
}
.link {
  color: #9ec5ff;
  text-decoration: none;
}
.link:hover {
  text-decoration: underline;
}
.sectionTitle {
  margin-top: 12px;
  font-weight: 700;
}
.actions {
  display: flex;
  justify-content: center;
  margin-top: 14px;
}
.btnPrimary {
  border: 1px solid #5a1d1d;
  background: #5a1d1d;
  color: #fff;
  border-radius: 10px;
  padding: 10px 18px;
  cursor: pointer;
}
.btnPrimary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.error {
  margin-top: 6px;
  color: #ffb4b4;
  font-size: 12px;
}
@media (max-width: 560px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>


<script setup lang="ts">
const form = reactive({ vatNumber: '', companyName: '', address: '' })
const { status, valid, company, pending, error, refresh } = useVatCheck(() => form.vatNumber)

// Autofill company details from VIES, without overwriting what the user typed themselves.
const autofilled = reactive({ companyName: '', address: '' })
watch(company, (value) => {
  if (!value) return
  if (value.name && form.companyName === autofilled.companyName) form.companyName = autofilled.companyName = value.name
  if (value.address && form.address === autofilled.address) form.address = autofilled.address = value.address
})

const messages: Record<string, string> = {
  valid: 'Registered for VAT',
  invalid: 'Not registered in VIES',
  invalid_format: 'This doesn\'t look like an EU VAT number',
  unavailable: 'VIES can\'t confirm this right now; you can still continue',
}

const submitted = ref<unknown>(null)
async function submit() {
  // The server re-validates: client-side results are UX only.
  submitted.value = await $fetch('/api/signup', { method: 'POST', body: form }).catch((err: unknown) => err)
}
</script>

<template>
  <main>
    <h1>nuxt-vat playground</h1>
    <form @submit.prevent="submit">
      <label>
        VAT number
        <input
          v-model="form.vatNumber"
          placeholder="BE 0417.497.106"
          autocomplete="off"
        >
      </label>
      <p
        class="status"
        :data-valid="valid"
      >
        <template v-if="pending">
          Checking…
        </template>
        <template v-else-if="status">
          {{ messages[status] }}
          <button
            v-if="status === 'unavailable'"
            type="button"
            @click="refresh"
          >
            Retry
          </button>
        </template>
        <template v-else-if="error">
          Couldn't check: {{ error.message }}
        </template>
      </p>

      <label>
        Company name
        <input v-model="form.companyName">
      </label>
      <label>
        Address
        <textarea
          v-model="form.address"
          rows="3"
        />
      </label>
      <button
        type="submit"
        :disabled="valid === false"
      >
        Submit
      </button>
    </form>

    <details open>
      <summary>Composable state</summary>
      <pre>{{ { status, valid, pending, company, error: error?.message ?? null } }}</pre>
    </details>
    <details
      v-if="submitted"
      open
    >
      <summary>Server response</summary>
      <pre>{{ submitted }}</pre>
    </details>
  </main>
</template>

<style>
main { max-width: 32rem; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, sans-serif; }
form { display: grid; gap: 0.75rem; }
label { display: grid; gap: 0.25rem; }
input, textarea, button { font: inherit; padding: 0.4rem 0.5rem; }
.status { min-height: 1.5em; margin: 0; }
.status[data-valid="true"] { color: green; }
.status[data-valid="false"] { color: crimson; }
pre { white-space: pre-wrap; background: #f4f4f4; padding: 0.5rem; }
</style>

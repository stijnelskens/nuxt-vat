<script setup lang="ts">
const badChecksum = useVatCheck('BE0403170702')
const wellFormed = useVatCheck(() => 'BE0417497106')
</script>

<template>
  <div>
    <div id="normalized">
      {{ isValidVatFormat('be 0417.497.106').normalized }}
    </div>
    <div id="ssr-invalid">
      {{ badChecksum.status.value }}/{{ badChecksum.valid.value }}
    </div>
    <div id="ssr-pending">
      {{ wellFormed.status.value }}/{{ wellFormed.valid.value }}
    </div>
  </div>
</template>

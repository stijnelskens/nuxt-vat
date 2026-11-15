// Extra build entries, merged by @nuxt/module-builder with its own (src/module + src/runtime).
// No `defineBuildConfig` import: unbuild isn't a direct dependency.
export default {
  entries: [
    // `nuxt-vat/zod` subpath; zod is an optional peer dependency and stays external.
    'src/zod',
  ],
}

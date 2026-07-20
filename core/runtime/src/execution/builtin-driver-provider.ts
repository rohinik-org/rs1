import type { DriverProvider, DriverProviderEntry, DriverBinding } from '@rohinik-org/capability-manifest'

// ponytail: runtime imports — driver packages loaded dynamically at boot; gracefully absent pre-Task 6-9
async function tryLoad(pkg: string, factoryFn: (mod: unknown) => DriverProviderEntry | undefined): Promise<DriverProviderEntry | undefined> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod = await import(/* @vite-ignore */ pkg)
    return factoryFn(mod)
  } catch {
    return undefined
  }
}

export class BuiltinDriverProvider implements DriverProvider {
  readonly id = 'builtin'
  readonly type = 'builtin' as const

  async load(): Promise<ReadonlyArray<DriverProviderEntry>> {
    const results = await Promise.all([
      tryLoad('@rohinik-org/driver-filesystem', (mod: unknown) => {
        const m = mod as { FilesystemDriver: new () => { descriptor: DriverBinding['descriptor'] } & DriverBinding['driver']; FILESYSTEM_CAPABILITY_IDS: string[] }
        const driver = new m.FilesystemDriver()
        return { binding: { driver, descriptor: driver.descriptor }, capabilityIds: m.FILESYSTEM_CAPABILITY_IDS }
      }),
      tryLoad('@rohinik-org/driver-local-shell', (mod: unknown) => {
        const m = mod as { LocalShellDriver: new () => { descriptor: DriverBinding['descriptor'] } & DriverBinding['driver']; LOCAL_SHELL_CAPABILITY_IDS: string[] }
        const driver = new m.LocalShellDriver()
        return { binding: { driver, descriptor: driver.descriptor }, capabilityIds: m.LOCAL_SHELL_CAPABILITY_IDS }
      }),
      tryLoad('@rohinik-org/driver-search', (mod: unknown) => {
        const m = mod as { SearchDriver: new () => { descriptor: DriverBinding['descriptor'] } & DriverBinding['driver']; SEARCH_CAPABILITY_IDS: string[] }
        const driver = new m.SearchDriver()
        return { binding: { driver, descriptor: driver.descriptor }, capabilityIds: m.SEARCH_CAPABILITY_IDS }
      }),
      tryLoad('@rohinik-org/driver-document', (mod: unknown) => {
        const m = mod as { DocumentDriver: new () => { descriptor: DriverBinding['descriptor'] } & DriverBinding['driver']; DOCUMENT_CAPABILITY_IDS: string[] }
        const driver = new m.DocumentDriver()
        return { binding: { driver, descriptor: driver.descriptor }, capabilityIds: m.DOCUMENT_CAPABILITY_IDS }
      }),
    ])
    return results.filter((e): e is DriverProviderEntry => e !== undefined)
  }
}

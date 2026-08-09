import { defineConfig, devices } from '@playwright/test';

const PORTA = Number(process.env.AVENCO_TEST_PORT || 4173);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,

  // Zero retries, de propósito: o tier E2E é hermético (sem rede, relógio fixo,
  // dados sintéticos). Se um teste só passa na segunda tentativa, existe um
  // não-determinismo para investigar — e reexecutar apenas o esconderia.
  retries: 0,

  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://localhost:${PORTA}`,
    // O app troca animação de contador por valor final quando o sistema pede
    // menos movimento. Isso torna as asserções numéricas síncronas, sem espera.
    reducedMotion: 'reduce',

    // O index.html recarrega a página quando o service worker assume o
    // controle (`controllerchange` → `location.reload()`). Num teste isso
    // destrói o contexto de execução no meio do fluxo. Bloquear o SW mantém o
    // comportamento do app intacto e o teste determinístico — o cache do PWA
    // não é o objeto desta suíte.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Escape hatch para ambientes que já trazem um Chromium instalado
        // (sandboxes, imagens de CI corporativas) e onde baixar outro seria
        // desperdício ou nem seria possível. Fora desses casos a variável não
        // é definida e o Playwright usa o browser que ele mesmo instalou.
        ...(process.env.AVENCO_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.AVENCO_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],

  webServer: {
    command: 'node tests/e2e/_server.mjs',
    port: PORTA,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

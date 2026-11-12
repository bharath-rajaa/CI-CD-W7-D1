// Runs once before the suite. Checks that the environment is configured.
// Failures here are SETUP problems, not product defects, so the message starts with SETUP_ERROR.
const REQUIRED = ['TEST_USERNAME', 'TEST_PASSWORD'] as const;

export default async function globalSetup() {
  const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `SETUP_ERROR: missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set them in .env locally or as GitHub Actions secrets.',
    );
  }
}

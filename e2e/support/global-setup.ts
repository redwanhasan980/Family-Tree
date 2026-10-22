// Playwright treats a web server as ready when either its URL answers or its output
// matches, and the emulator hub answers before Auth and Firestore listen. So wait for both.
const EMULATORS = ['http://127.0.0.1:9099/', 'http://127.0.0.1:8080/'];

async function isUp(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<void> {
  const deadline = Date.now() + 120_000;
  for (const url of EMULATORS) {
    while (!(await isUp(url))) {
      if (Date.now() > deadline) throw new Error(`Emulator at ${url} did not start.`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

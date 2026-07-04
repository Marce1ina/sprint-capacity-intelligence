function collectProbePaths(value: unknown, probe: string, path: string, matches: string[]): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    if (value.includes(probe)) {
      matches.push(path);
    }
    return;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    const serialized = String(value);
    if (serialized.includes(probe)) {
      matches.push(path);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectProbePaths(item, probe, `${path}[${index}]`, matches);
    });
    return;
  }

  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      collectProbePaths(nested, probe, `${path}.${key}`, matches);
    }
  }
}

/** Returns JSON paths where `probe` appears in any serialized string value. */
export function findSecretProbePaths(value: unknown, probe: string, path = "$"): string[] {
  const matches: string[] = [];
  collectProbePaths(value, probe, path, matches);
  return matches;
}

/** Throws when `probe` appears anywhere in a JSON-serializable tree. */
export function assertNoSecretProbe(value: unknown, probe: string): void {
  const paths = findSecretProbePaths(value, probe);
  if (paths.length > 0) {
    throw new Error(`Secret probe "${probe}" found at: ${paths.join(", ")}`);
  }
}

/** Parses a Response body as JSON (or raw text) and asserts no probe substring leaks. */
export async function assertResponseBodyHasNoSecretProbe(response: Response, probe: string): Promise<void> {
  const text = await response.text();

  try {
    assertNoSecretProbe(JSON.parse(text) as unknown, probe);
  } catch (error) {
    if (error instanceof SyntaxError) {
      if (text.includes(probe)) {
        throw new Error(`Secret probe "${probe}" found in response body`);
      }
      return;
    }
    throw error;
  }
}

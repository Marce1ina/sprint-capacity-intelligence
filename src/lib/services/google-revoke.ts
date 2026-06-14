export async function revokeGoogleRefreshToken(refreshToken: string): Promise<void> {
  const body = new URLSearchParams({ token: refreshToken });

  try {
    const response = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      // eslint-disable-next-line no-console -- best-effort revoke; log status without token data
      console.error("Google token revoke failed:", response.status);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // eslint-disable-next-line no-console -- best-effort revoke; log without token data
    console.error("Google token revoke request failed:", message);
  }
}

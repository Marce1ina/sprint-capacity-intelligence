interface AuthErrorLike {
  message?: string;
  code?: string;
}

const CODE_MESSAGES: Record<string, string> = {
  access_denied: "Google sign-in was cancelled.",
  invalid_grant: "Sign-in session expired. Please try again.",
  otp_expired: "Sign-in session expired. Please try again.",
  bad_oauth_state: "Sign-in session expired. Please try again.",
  validation_failed: "Could not sign in. Please try again.",
};

export function authErrorUserMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) {
    return "Could not sign in. Please try again.";
  }

  if (error.code && CODE_MESSAGES[error.code]) {
    return CODE_MESSAGES[error.code];
  }

  const message = error.message?.toLowerCase() ?? "";
  if (message.includes("expired")) {
    return "Sign-in session expired. Please try again.";
  }
  if (message.includes("access denied") || message.includes("cancelled") || message.includes("canceled")) {
    return "Google sign-in was cancelled.";
  }

  return "Could not sign in. Please try again.";
}

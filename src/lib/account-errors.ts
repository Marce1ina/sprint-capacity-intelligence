const ACCOUNT_DELETION_ERRORS: Record<string, string> = {
  not_authenticated: "You must be signed in to delete your account.",
  config_error: "Account deletion is temporarily unavailable. Please try again later.",
  delete_failed: "We could not delete your account. Please try again or contact support.",
};

export function accountDeletionErrorMessage(code: string): string {
  return ACCOUNT_DELETION_ERRORS[code] ?? ACCOUNT_DELETION_ERRORS.delete_failed;
}

import React, { useState } from "react";
import { Globe, KeyRound } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { isAllowedJiraSiteUrl } from "@/lib/jira-site-url";

interface Props {
  serverError?: string | null;
}

export default function JiraPatForm({ serverError }: Props) {
  const [pat, setPat] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [errors, setErrors] = useState<{ pat?: string; siteUrl?: string }>({});

  function validate() {
    const next: typeof errors = {};

    if (!pat.trim()) {
      next.pat = "API token is required";
    }

    if (!siteUrl.trim()) {
      next.siteUrl = "Site URL is required";
    } else if (!isAllowedJiraSiteUrl(siteUrl)) {
      next.siteUrl = "Enter a valid Jira site URL (e.g. https://yourorg.atlassian.net)";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  return (
    <form method="POST" action="/api/onboarding/jira" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="siteUrl"
        label="Jira site URL"
        type="url"
        value={siteUrl}
        onChange={(v) => {
          setSiteUrl(v);
          clearError("siteUrl");
        }}
        placeholder="https://yourorg.atlassian.net"
        error={errors.siteUrl}
        icon={<Globe className="size-4" />}
      />

      <FormField
        id="pat"
        label="Jira API token"
        type={showPat ? "text" : "password"}
        value={pat}
        onChange={(v) => {
          setPat(v);
          clearError("pat");
        }}
        placeholder="Paste your Atlassian API token"
        error={errors.pat}
        icon={<KeyRound className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPat}
            onToggle={() => {
              setShowPat(!showPat);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Validating..." icon={<KeyRound className="size-4" />}>
        Save and continue
      </SubmitButton>
    </form>
  );
}

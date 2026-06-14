import { useState } from "react";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";

interface Props {
  serverError?: string | null;
}

export default function DeleteAccountForm({ serverError }: Props) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <div className="space-y-4">
        <ServerError message={serverError} />
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            setArmed(true);
          }}
        >
          Delete account
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ServerError message={serverError} />
      <p className="text-sm text-red-200/80">
        This permanently deletes your account and all stored data. This action cannot be undone.
      </p>
      <form method="POST" action="/api/account/delete" className="flex flex-wrap gap-3">
        <Button type="submit" variant="destructive">
          Yes, delete permanently
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-white/20 bg-white text-black hover:bg-white/90 hover:text-black"
          onClick={() => {
            setArmed(false);
          }}
        >
          Cancel
        </Button>
      </form>
    </div>
  );
}

import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  serverError?: string | null;
}

export default function SignInForm({ serverError }: Props) {
  return (
    <div className="space-y-4">
      <ServerError message={serverError} />
      <Button
        asChild
        className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
      >
        <a href="/api/auth/google" className="flex items-center justify-center gap-2">
          <LogIn className="size-4" />
          Continue with Google
        </a>
      </Button>
    </div>
  );
}

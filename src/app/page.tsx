import { LandingPage } from "@/components/landing/LandingPage";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Public landing page. Signed-in visitors get CTAs pointing at their library
 * instead of the sign-up flow, but the page renders either way.
 */
async function isSignedIn(): Promise<boolean> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return Boolean(user);
  } catch {
    return false;
  }
}

export default async function Home() {
  return <LandingPage signedIn={await isSignedIn()} />;
}

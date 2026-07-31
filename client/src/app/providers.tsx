import type { ReactNode } from "react";
import { Helmet, HelmetProvider } from "react-helmet-async";
import type { ConfigWrapper } from "@rin/config";
import type { Profile } from "../state/profile";
import { ClientConfigContext } from "../state/config";
import { ProfileContext } from "../state/profile";

const FAVICON_HREF = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22><rect width=%2216%22 height=%2216%22 fill=%22%231e293b%22/><text x=%2250%%22 y=%2258%%22 font-family=%22system-ui, -apple-system, sans-serif%22 font-weight=%22900%22 font-size=%2214%22 fill=%22%23f1f5f9%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22>A</text></svg>";

export function AppProviders({
  children,
  config,
  profile,
}: {
  children: ReactNode;
  config: ConfigWrapper;
  profile: Profile | undefined | null;
}) {
  return (
    <HelmetProvider>
      <ClientConfigContext.Provider value={config}>
        <ProfileContext.Provider value={profile}>
          <Helmet>
            <link rel="icon" type="image/svg+xml" href={FAVICON_HREF} />
          </Helmet>
          {children}
        </ProfileContext.Provider>
      </ClientConfigContext.Provider>
    </HelmetProvider>
  );
}

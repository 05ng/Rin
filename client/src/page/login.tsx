import { t } from "i18next";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ButtonWithLoading } from "../components/button";
import { Icon } from "../components/icon";
import { Input } from "../components/input";
import { client, oauth_url, google_oauth_url } from "../app/runtime";
import { setAuthToken } from "../utils/auth";
import { getLoginRedirectPath } from "../utils/auth-redirect";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [awaitingMfa, setAwaitingMfa] = useState(
    () => new URLSearchParams(window.location.search).get("mfa") === "1",
  );
  const [authStatus, setAuthStatus] = useState<{ github: boolean; google: boolean; password: boolean }>({
    github: false,
    google: false,
    password: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();

  useEffect(() => {
    client.auth.status().then(({ data }) => {
      if (data) {
        setAuthStatus(data);
      }
    });
  }, []);

  function finishLogin(token: string | undefined) {
    if (token) {
      setAuthToken(token);
    }
    setLocation(getLoginRedirectPath(window.location.search));
    window.location.reload();
  }

  const handleLogin = async () => {
    if (!username || !password) {
      setError(t("login.error.empty"));
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const { data, error: apiError } = await client.auth.login({ username, password });

      if (apiError) {
        setError(t("login.error.invalid"));
        return;
      }

      if (data?.mfaRequired) {
        setAwaitingMfa(true);
        setPassword("");
        return;
      }

      if (data?.success) {
        finishLogin(data.token);
        return;
      }

      setError(t("login.error.failed"));
    } catch {
      setError(t("login.error.network"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaVerification = async () => {
    const code = mfaCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setError(t("login.error.code"));
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const { data, error: apiError } = await client.auth.verifyMfa({ code });
      if (apiError) {
        setError(t("login.error.invalid_code"));
        return;
      }

      if (data?.success) {
        finishLogin(data.token);
        return;
      }

      setError(t("login.error.failed"));
    } catch {
      setError(t("login.error.network"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="my-8 flex items-center justify-center">
      <div className="bg-w flex w-full max-w-md flex-col items-center justify-between space-y-4 rounded-2xl p-8 t-primary shadow-lg">
        <p className="text-2xl font-bold">{awaitingMfa ? t("login.mfa.title") : t("login.title")}</p>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {awaitingMfa ? (
          <>
            <p className="text-center text-sm t-secondary">{t("login.mfa.description")}</p>
            <Input
              autofocus
              value={mfaCode}
              setValue={setMfaCode}
              placeholder={t("login.mfa.placeholder")}
              onSubmit={handleMfaVerification}
              disabled={isLoading}
            />
            <div className="flex flex-row items-center space-x-4 pt-2">
              <ButtonWithLoading
                title={isLoading ? t("login.mfa.verifying") : t("login.mfa.verify")}
                onClick={handleMfaVerification}
                loading={isLoading}
              />
            </div>
          </>
        ) : (
          <>
            {authStatus.password && (
              <>
                <Input
                  value={username}
                  setValue={setUsername}
                  placeholder={t("login.username.placeholder")}
                  disabled={isLoading}
                  autofocus
                />
                <Input
                  value={password}
                  setValue={setPassword}
                  placeholder={t("login.password.placeholder")}
                  type="password"
                  onSubmit={handleLogin}
                  disabled={isLoading}
                />
                <div className="flex flex-row items-center space-x-4 pt-2">
                  <ButtonWithLoading
                    title={isLoading ? t("login.loading") : t("login.title")}
                    onClick={handleLogin}
                    loading={isLoading}
                  />
                </div>
              </>
            )}

            {(authStatus.github || authStatus.google) && (
              <div className="flex flex-col items-center justify-center space-y-2 pt-2">
                {authStatus.password && <p className="text-xs t-secondary">{t("login.or")}</p>}
                {!authStatus.password && <p className="text-xs t-secondary">{t("login.oauth_only")}</p>}
                <div className="flex flex-row items-center space-x-4">
                  {authStatus.github && (
                    <Icon
                      label={t("github_login")}
                      name="ri-github-line"
                      onClick={() => {
                        window.location.href = oauth_url;
                      }}
                      hover
                    />
                  )}
                  {authStatus.google && (
                    <Icon
                      label={t("google_login", "Login with Google")} // Ensure fallback if i18n is missing
                      name="ri-google-line"
                      onClick={() => {
                        window.location.href = google_oauth_url;
                      }}
                      hover
                    />
                  )}
                </div>
              </div>
            )}

            {!authStatus.github && !authStatus.google && !authStatus.password && (
              <p className="text-sm text-red-500">{t("login.no_methods")}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
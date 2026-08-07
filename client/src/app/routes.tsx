import type { ReactNode } from "react";
import { lazy, Suspense, useContext, useState } from "react";
import ReactModal from "react-modal";
import type { DefaultParams, PathPattern } from "wouter";
import { Route, Switch } from "wouter";
import { AdminLayout } from "../components/admin-layout";
import Footer from "../components/footer";
import { Header } from "../components/header";
import { Waiting } from "../components/loading";
import { Padding } from "../components/padding";
import { getHeaderLayoutDefinition } from "../components/site-header/layout-registry";
import { Tips, TipsPage } from "../components/tips";
import useTableOfContents from "../hooks/useTableOfContents";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { ErrorPage } from "../page/error";
import { ProfileContext } from "../state/profile";
import { tryInt } from "../utils/int";
import { useTranslation } from "react-i18next";

const CallbackPage = lazy(() => import("../page/callback").then((module) => ({ default: module.CallbackPage })));
const CloudflareUsagePage = lazy(() => import("../page/cloudflare-usage").then((module) => ({ default: module.CloudflareUsagePage })));
const CompatTasksPage = lazy(() => import("../page/compat-tasks").then((module) => ({ default: module.CompatTasksPage })));
const FeedPage = lazy(() => import("../page/feed").then((module) => ({ default: module.FeedPage })));
const FeedsPage = lazy(() => import("../page/feeds").then((module) => ({ default: module.FeedsPage })));
const FriendsPage = lazy(() => import("../page/friends").then((module) => ({ default: module.FriendsPage })));
const GamePage = lazy(() => import("../page/game").then((module) => ({ default: module.GamePage })));
const HashtagPage = lazy(() => import("../page/hashtag").then((module) => ({ default: module.HashtagPage })));
const HashtagsPage = lazy(() => import("../page/hashtags").then((module) => ({ default: module.HashtagsPage })));
const HealthPage = lazy(() => import("../page/health").then((module) => ({ default: module.HealthPage })));
const IsbnBarcodePage = lazy(() => import("../page/isbn-barcode").then((module) => ({ default: module.IsbnBarcodePage })));
const LoginPage = lazy(() => import("../page/login").then((module) => ({ default: module.LoginPage })));
const MathPracticeGamePage = lazy(() => import("../page/math-practice").then((module) => ({ default: module.MathPracticeGamePage })));
const MinecraftGamePage = lazy(() => import("../page/minecraft").then((module) => ({ default: module.MinecraftGamePage })));
const MomentsPage = lazy(() => import("../page/moments").then((module) => ({ default: module.MomentsPage })));
const MyIpPage = lazy(() => import("../page/my-ip").then((module) => ({ default: module.MyIpPage })));
const OcbcAdbCalculatorPage = lazy(() => import("../page/ocbc-adb-calculator").then((module) => ({ default: module.OcbcAdbCalculatorPage })));
const PenaltyKickGamePage = lazy(() => import("../page/penalty-kick").then((module) => ({ default: module.PenaltyKickGamePage })));
const ProfilePage = lazy(() => import("../page/profile").then((module) => ({ default: module.ProfilePage })));
const QrCodePage = lazy(() => import("../page/qr-code").then((module) => ({ default: module.QrCodePage })));
const QueueStatusPage = lazy(() => import("../page/queue-status").then((module) => ({ default: module.QueueStatusPage })));
const RestaurantGamePage = lazy(() => import("../page/restaurant-game").then((module) => ({ default: module.RestaurantGamePage })));
const SearchPage = lazy(() => import("../page/search").then((module) => ({ default: module.SearchPage })));
const Settings = lazy(() => import("../page/settings").then((module) => ({ default: module.Settings })));
const TimelinePage = lazy(() => import("../page/timeline").then((module) => ({ default: module.TimelinePage })));
const ToolsPage = lazy(() => import("../page/tools").then((module) => ({ default: module.ToolsPage })));
const WaterFallGamePage = lazy(() => import("../page/game").then((module) => ({ default: module.WaterFallGamePage })));
const WritingPage = lazy(() => import("../page/writing").then((module) => ({ default: module.WritingPage })));

export function AppRoutes() {
  const { t } = useTranslation();

  return (
    <Switch>
      <AppRoute path="/">
        <FeedsPage />
      </AppRoute>

      <AppRoute path="/timeline">
        <TimelinePage />
      </AppRoute>

      <AppRoute path="/moments">
        <MomentsPage />
      </AppRoute>

      <AppRoute path="/friends">
        <FriendsPage />
      </AppRoute>

      <AppRoute path="/hashtags">
        <HashtagsPage />
      </AppRoute>

      <AppRoute path="/hashtag/:name">
        {(params) => <HashtagPage name={params.name || ""} />}
      </AppRoute>

      <AppRoute path="/search/:keyword">
        {(params) => <SearchPage keyword={params.keyword || ""} />}
      </AppRoute>

      <AdminRoute path="/admin/settings" requirePermission title={t("settings.title")} description={t("admin.settings_description")}>
        <Settings />
      </AdminRoute>

      <AdminRoute path="/admin/health" requirePermission title={t("health.title")} description={t("admin.health_description")}>
        <HealthPage />
      </AdminRoute>

      <AdminRoute path="/admin/queue-status" requirePermission title={t("queue_status.title")} description={t("admin.queue_status_description")}>
        <QueueStatusPage />
      </AdminRoute>

      <AdminRoute path="/admin/cloudflare-usage" requirePermission title={t("cloudflare_usage.title")} description={t("admin.cloudflare_usage_description")}>
        <CloudflareUsagePage />
      </AdminRoute>

      <AdminRoute path="/admin/compat-tasks" requirePermission title={t("compat_tasks.title")} description={t("admin.compat_tasks_description")}>
        <CompatTasksPage />
      </AdminRoute>

      <AdminRoute path="/admin/writing" requirePermission title={t("writing")} description={t("admin.writing_description")}>
        <WritingPage />
      </AdminRoute>

      <AdminRoute path="/admin/writing/:id" requirePermission title={t("writing")} description={t("admin.writing_description")}>
        {({ id }) => <WritingPage id={tryInt(0, id)} />}
      </AdminRoute>

      <AppRoute path="/callback">
        <CallbackPage />
      </AppRoute>

      <AppRoute path="/login">
        <LoginPage />
      </AppRoute>

      <AppRoute path="/profile">
        <ProfilePage />
      </AppRoute>

      <AppRoute path="/game/water-fall">
        <WaterFallGamePage />
      </AppRoute>

      <AppRoute path="/game/penalty-kick">
        <PenaltyKickGamePage />
      </AppRoute>
      <AppRoute path="/game/restaurant">
        <RestaurantGamePage />
      </AppRoute>

      <AppRoute path="/game/math-practice">
        <MathPracticeGamePage />
      </AppRoute>

      <AppRoute path="/game/minecraft">
        <MinecraftGamePage />
      </AppRoute>

      <AppRoute path="/game">
        <GamePage />
      </AppRoute>

      <AppRoute path="/tools">
        <ToolsPage />
      </AppRoute>

      <AppRoute path="/qr-code">
        <QrCodePage />
      </AppRoute>

      <AppRoute path="/isbn-barcode">
        <IsbnBarcodePage />
      </AppRoute>

      <AppRoute path="/my-ip">
        <MyIpPage />
      </AppRoute>

      <AppRoute path="/ocbc-adb-calculator">
        <OcbcAdbCalculatorPage />
      </AppRoute>

      <AppRoute path="/en">
        <FeedsPage routeLang="en" />
      </AppRoute>

      <AppRoute path="/zh-CN">
        <FeedsPage routeLang="zh-CN" />
      </AppRoute>

      <TocRoute path="/feed/:id">
        {(params, toc, cleanup) => <FeedPage id={params.id || ""} routeLang="en" TOC={toc} clean={cleanup} />}
      </TocRoute>

      <TocRoute path="/:lang/feed/:id">
        {(params, toc, cleanup) => {
          const lang = params.lang || "";
          if (lang === "en" || lang === "zh-CN") {
            return <FeedPage id={params.id || ""} routeLang={lang} TOC={toc} clean={cleanup} />;
          }
          return <ErrorPage error={t("error.not_found")} />;
        }}
      </TocRoute>

      <TocRoute path="/:alias">
        {(params, toc, cleanup) => <FeedPage id={params.alias || ""} routeLang="en" TOC={toc} clean={cleanup} />}
      </TocRoute>

      <TocRoute path="/:lang/:alias">
        {(params, toc, cleanup) => {
          const lang = params.lang || "";
          if (lang === "en" || lang === "zh-CN") {
            return <FeedPage id={params.alias || ""} routeLang={lang} TOC={toc} clean={cleanup} />;
          }
          return <ErrorPage error={t("error.not_found")} />;
        }}
      </TocRoute>

      <AppRoute path="/user/github">
        <TipsPage>
          <Tips value={t("error.api_url")} type="error" />
        </TipsPage>
      </AppRoute>

      <AppRoute path="/*/user/github">
        <TipsPage>
          <Tips value={t("error.api_url_slash")} type="error" />
        </TipsPage>
      </AppRoute>

      <AppRoute path="/user/github/callback">
        <TipsPage>
          <Tips value={t("error.github_callback")} type="error" />
        </TipsPage>
      </AppRoute>

      <AppRoute>
        <ErrorPage error={t("error.not_found")} />
      </AppRoute>
    </Switch>
  );
}

function TOCHeader({ TOC }: { TOC: () => JSX.Element }) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <div className="shrink-0 lg:hidden">
      <button
        onClick={() => setIsOpened(true)}
        className="w-10 h-10 rounded-full flex flex-row items-center justify-center"
      >
        <i className="ri-menu-2-line text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 ri-lg md:ri-sm md:t-secondary"></i>
      </button>
      <ReactModal
        isOpen={isOpened}
        style={{
          content: {
            top: "50%",
            left: "50%",
            right: "auto",
            bottom: "auto",
            marginRight: "-50%",
            transform: "translate(-50%, -50%)",
            padding: "0",
            border: "none",
            borderRadius: "16px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            background: "none",
          },
          overlay: {
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            zIndex: 1000,
          },
        }}
        onRequestClose={() => setIsOpened(false)}
      >
        <div className="w-[80vw] sm:w-[60vw] lg:w-[40vw] overflow-clip relative t-primary">
          <TOC />
        </div>
      </ReactModal>
    </div>
  );
}

function AppRoute({
  path,
  children,
  headerComponent,
  paddingClassName,
  requirePermission,
}: {
  path?: PathPattern;
  children: ReactNode | ((params: DefaultParams) => ReactNode);
  headerComponent?: ReactNode;
  paddingClassName?: string;
  requirePermission?: boolean;
}) {
  const profile = useContext(ProfileContext);
  const siteConfig = useSiteConfig();
  const { t } = useTranslation();

  const content =
    requirePermission && !profile?.permission ? <ErrorPage error={t("error.permission_denied")} /> : children;

  return (
    <Route path={path}>
      {(params) => {
        const resolvedContent = typeof content === "function" ? content(params) : content;
        const layoutDefinition = getHeaderLayoutDefinition(siteConfig.headerLayout);

        return layoutDefinition.renderRouteShell({
          header: <Header>{headerComponent}</Header>,
          content: (
            <Padding className={paddingClassName}>
              <Suspense fallback={<Waiting />}>{resolvedContent}</Suspense>
            </Padding>
          ),
          footer: <Footer />,
          paddingClassName,
        });
      }}
    </Route>
  );
}

function AdminRoute({
  path,
  children,
  requirePermission,
  title,
  description,
}: {
  path: PathPattern;
  children: ReactNode | ((params: DefaultParams) => ReactNode);
  requirePermission?: boolean;
  title: string;
  description: string;
}) {
  const profile = useContext(ProfileContext);
  const { t } = useTranslation();
  const content =
    requirePermission && !profile?.permission ? <ErrorPage error={t("error.permission_denied")} /> : children;

  return (
    <Route path={path}>
      {(params) => (
        <AdminLayout title={title} description={description}>
          <Suspense fallback={<Waiting />}>
            {typeof content === "function" ? content(params) : content}
          </Suspense>
        </AdminLayout>
      )}
    </Route>
  );
}

function TocRoute({
  path,
  children,
}: {
  path: PathPattern;
  children: (params: DefaultParams, toc: () => JSX.Element, cleanup: (id: string) => void) => ReactNode;
}) {
  const { TOC, cleanup } = useTableOfContents(".toc-content");

  return (
    <AppRoute path={path} headerComponent={<TOCHeader TOC={TOC} />} paddingClassName="mx-4">
      {(params) => children(params, TOC, cleanup)}
    </AppRoute>
  );
}

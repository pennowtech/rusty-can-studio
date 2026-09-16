/**
 * Sidebar.tsx
 * ------------------------------------------------------------
 * Primary application navigation sidebar.
 *
 * RESPONSIBILITY
 * - Supplies this app's nav items, active view, and logo/About affordance
 *   to the shared @sbt/desktop-kit AppNavRail component.
 * - Reflects the current active view via appShellStore.
 * - Opens the shared About modal (AppAboutDialog) on logo click.
 *
 * Rendering, grouping, collapse/expand, its persistence, and the toggle
 * button all live in AppNavRail (shared with FlexMQTT's nav rail) — this
 * file only supplies the CAN-Studio-specific data and routing glue.
 */
import { AppNavRail, type NavItem } from "@sbt/desktop-kit/nav/AppNavRail";
import { AppDock } from "@sbt/desktop-kit/nav/AppDock";
import { useNavRailStore } from "@sbt/desktop-kit/nav/navRailStore";
import { AppAboutDialog } from "@sbt/desktop-kit/nav/AppAboutDialog";
import { useI18nStore } from "@/i18n/i18nStore";
import { useAppStore, type AppView } from "@/store/appShellStore";
import appLogo from "@/assets/rusty-can-studio-logo.png";
import { Activity, Terminal, Sliders, Edit3, Settings, HelpCircleIcon, Keyboard } from "lucide-react";
import pkg from "../../package.json";

export function Sidebar() {
  const { view, setView, aboutOpen, setAboutOpen } = useAppStore();
  const t = useI18nStore((s) => s.t);
  const useDock = useNavRailStore((s) => s.useDock);
  const orientation = useNavRailStore((s) => s.orientation);
  const variant = useNavRailStore((s) => s.variant);
  const autoHide = useNavRailStore((s) => s.autoHide);
  const autoHideDelayMs = useNavRailStore((s) => s.autoHideDelayMs);

  const items: NavItem[] = [
    { id: "monitor", icon: Activity, label: t("nav.monitor"), group: "Workspace" },
    { id: "terminal", icon: Terminal, label: t("nav.terminal"), group: "Workspace" },
    { id: "simulator", icon: Sliders, label: t("nav.simulator"), group: "Workspace" },
    { id: "profile-editor", icon: Edit3, label: t("nav.profileEditor"), group: "Profiles" },
    { id: "settings", icon: Settings, label: t("nav.settings"), group: "System" },
    { id: "help", icon: HelpCircleIcon, label: t("nav.help"), group: "System" },
    { id: "shortcuts", icon: Keyboard, label: t("nav.shortcuts"), group: "System" },
  ];

  const logo = { src: appLogo, onClick: () => setAboutOpen(true), title: "About RustyCAN" };

  return (
    <>
      {useDock ? (
        <AppDock
          items={items}
          activeId={view}
          onSelect={(id) => setView(id as AppView)}
          logo={logo}
          orientation={orientation}
          variant={variant}
          autoHide={autoHide}
          autoHideDelayMs={autoHideDelayMs}
        />
      ) : (
        <AppNavRail items={items} activeId={view} onSelect={(id) => setView(id as AppView)} logo={logo} />
      )}

      <AppAboutDialog
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        logoSrc={appLogo}
        appName="RustyCAN"
        version={`Version ${pkg.version}`}
        description="A tool to inspect, decode, and simulate CAN and CAN-FD traffic. It provides a fast and lightweight environment to capture live traces, transmit frames, and build automated testing workflows."
        infoRows={[{ label: "Backend", value: "gRPC, TCP, WebSocket" }, { label: "Rust", value: "1.98.0" }]}
        copyright={`© ${new Date().getFullYear()} RustyCAN. All rights reserved.`}
      />
    </>
  );
}

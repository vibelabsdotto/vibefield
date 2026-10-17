"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import type { ReactNode } from "react";
import {
  Aperture,
  UsersRound,
  Clapperboard,
  Images,
  Activity,
  Settings2,
  Sun,
  Moon,
  ArrowUpRight,
} from "lucide-react";
import type { Campaign } from "@vibefield/contracts";
import { useJobs, useList, useSettings, isActiveJob } from "@/lib/api";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SelectField } from "@/components/studio";
import { Separator } from "@/components/ui/separator";
const navigation = [
  { href: "/characters", title: "Characters", icon: UsersRound },
  { href: "/campaigns", title: "Campaigns", icon: Clapperboard },
  { href: "/library", title: "Library", icon: Images },
  { href: "/jobs", title: "Jobs", icon: Activity },
  { href: "/settings", title: "Settings", icon: Settings2 },
];
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();
  const settings = useSettings();
  const jobs = useJobs();
  const campaigns = useList<Campaign>(
    pathname.startsWith("/campaigns/") ? "/campaigns" : null,
  );
  const campaignId = pathname.startsWith("/campaigns/")
    ? pathname.split("/")[2]
    : undefined;
  const active = jobs.data?.items.filter(isActiveJob) ?? [];
  const budget = settings.data?.videoBudget;
  return (
    <>
      <a
        href="#main-content"
        className="sr-only fixed top-2 left-2 z-50 rounded bg-primary p-3 text-primary-foreground focus:not-sr-only"
      >
        Skip to content
      </a>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-4 group-data-[collapsible=icon]:px-2">
          <Link
            href="/characters"
            className="flex min-w-0 items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Aperture
              className="size-7 shrink-0 text-primary"
              strokeWidth={1.6}
            />
            <span className="text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
              VibeField
            </span>
          </Link>
          {campaignId && (
            <div className="mt-3 min-w-0 group-data-[collapsible=icon]:hidden">
              <SelectField
                label="Current campaign"
                value={campaignId}
                options={campaigns.items.map((campaign) => ({
                  value: campaign.id,
                  label: campaign.name,
                }))}
                onChange={(id) => {
                  router.push(`/campaigns/${id}`);
                  setOpenMobile(false);
                }}
              />
              {campaigns.hasNextPage && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => void campaigns.fetchNextPage()}
                >
                  More campaigns
                </Button>
              )}
            </div>
          )}
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {navigation.map(({ href, title, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    render={<Link href={href} />}
                    isActive={pathname.startsWith(href)}
                    tooltip={title}
                    onClick={() => setOpenMobile(false)}
                  >
                    <Icon />
                    <span>{title}</span>
                    {href === "/jobs" && active.length > 0 && (
                      <Badge variant="secondary" className="ml-auto">
                        {active.length}
                      </Badge>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-4 group-data-[collapsible=icon]:px-2">
          <div className="flex flex-col gap-3 group-data-[collapsible=icon]:hidden">
            {active[0] && (
              <Link
                href={`/jobs/${active[0].id}`}
                className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
              >
                <span className="truncate">
                  {active[0].purpose} · {active[0].status}
                </span>
                <ArrowUpRight className="size-3" />
              </Link>
            )}
            <Link
              href="/settings"
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="text-muted-foreground">Video submissions</span>
              <Badge variant="outline">
                {budget ? `${budget.used} / ${budget.cap}` : "Unavailable"}
              </Badge>
            </Link>
            {budget && !budget.enabled && (
              <p className="text-xs text-muted-foreground">
                External video disabled
              </p>
            )}
            <Separator />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              Local studio
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Toggle light or dark theme"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              <Sun className="hidden dark:block" />
              <Moon className="block dark:hidden" />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm sm:px-7">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">
            {navigation.find((item) => pathname.startsWith(item.href))?.title ??
              "Studio"}
          </span>
          {active.length > 0 && (
            <Link
              href="/jobs"
              className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span className="size-1.5 rounded-full bg-primary" />
              {active.length} active
            </Link>
          )}
        </header>
        <main id="main-content" className="min-w-0 flex-1 p-4 sm:p-7 lg:p-8">
          {children}
        </main>
        <footer className="flex flex-wrap justify-between gap-2 px-4 py-4 text-xs text-muted-foreground sm:px-7">
          <span>Original identities. Deliberate frames.</span>
          <span>Media and history stored locally.</span>
        </footer>
      </SidebarInset>
    </>
  );
}

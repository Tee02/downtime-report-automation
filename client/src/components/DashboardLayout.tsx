import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import DotField from "@/components/DotField";
import { BarChart3, Columns3, FileSpreadsheet, KeyRound, Lock, LogOut, PanelLeft, ShieldCheck } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { VersionHistorySection } from "./VersionHistorySection";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const menuItems = [
  { icon: FileSpreadsheet, label: "Report studio", path: "/" },
  { icon: BarChart3, label: "Analysis studio", path: "/analysis" },
  { icon: Columns3, label: "Comparison studio", path: "/comparison" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;
const SKYWORLDS_LOGO_URL = "/manus-storage/skyworldslogo_4b1f1436.jpg";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();
  const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");

  const trpcUtils = trpc.useUtils();
  const loginMutation = trpc.auth.loginWithPasscode.useMutation({
    onSuccess: async () => {
      await trpcUtils.auth.me.invalidate();
      await trpcUtils.savedReports.list.invalidate();
      setIsPasscodeModalOpen(false);
      setPasscode("");
      setPasscodeError("");
      toast.success("Signed in successfully.");
    },
    onError: (err) => {
      setPasscodeError(err.message || "Incorrect password.");
    },
  });

  const handlePasscodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) {
      setPasscodeError("Please enter the password.");
      return;
    }
    setPasscodeError("");
    loginMutation.mutate({ passcode });
  };

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-[#adbBda]/70 bg-[#ede8f5] text-slate-800 shadow-[10px_0_35px_rgba(61,82,160,0.08)]"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-20 justify-center border-b border-[#adbBda]/70 overflow-hidden">
            <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3 px-2"} transition-all w-full overflow-hidden`}>
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
                title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed && (
                <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
                  <img
                    src={SKYWORLDS_LOGO_URL}
                    alt="Genting SkyWorlds"
                    className="h-9 w-9 rounded-lg border border-[#8697c4]/60 bg-white object-cover p-0.5 shadow-sm shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="block truncate text-sm font-extrabold tracking-tight text-[#293252]">
                      SkyWorlds 11-1
                    </span>
                    <span className="block truncate text-[10px] font-medium uppercase tracking-[0.14em] text-[#5368b4]">
                      Downtime Studio
                    </span>
                  </div>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <Link
                        href={item.path}
                        onClick={() => setLocation(item.path)}
                        className="flex items-center gap-2 w-full h-full cursor-pointer"
                      >
                        <item.icon
                          className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`}
                        />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase() ?? "T"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user ? (user.name || "SkyWorlds Operator") : "Guest Visitor"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user ? "Full Edit & Delete Access" : "Click to sign in"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-white">
                {user ? <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem> : <DropdownMenuItem
                  onClick={() => {
                    setPasscode("");
                    setPasscodeError("");
                    setIsPasscodeModalOpen(true);
                  }}
                  className="cursor-pointer font-semibold text-[#3D52A0]"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  <span>Sign in as Operator</span>
                </DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>

            <VersionHistorySection isCollapsed={isCollapsed} />
          </SidebarFooter>
        </Sidebar>

        {/* In-App Simple Passcode Modal */}
        <Dialog open={isPasscodeModalOpen} onOpenChange={setIsPasscodeModalOpen}>
          <DialogContent className="sm:max-w-[360px] bg-white border border-[#adbBda]/80 shadow-2xl rounded-2xl">
            <DialogHeader>
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 border border-indigo-200 text-[#3D52A0] mb-2">
                <KeyRound className="h-5 w-5" />
              </div>
              <DialogTitle className="text-center text-lg font-extrabold text-[#293252]">
                Sign In
              </DialogTitle>
              <DialogDescription className="text-center text-xs text-slate-500">
                Enter password to unlock editing and administrative features.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handlePasscodeSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Input
                  type="password"
                  placeholder="Enter password"
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value);
                    if (passcodeError) setPasscodeError("");
                  }}
                  autoFocus
                  className="h-10 text-center font-mono text-lg tracking-widest font-bold border-slate-300 focus:border-[#3D52A0]"
                />
                {passcodeError && (
                  <p className="text-center text-xs font-semibold text-rose-600">
                    {passcodeError}
                  </p>
                )}
              </div>

              <DialogFooter className="flex gap-2 sm:justify-between pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsPasscodeModalOpen(false)}
                  className="text-xs text-slate-500"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={loginMutation.isPending}
                  className="bg-[#3D52A0] text-white hover:bg-[#293252] text-xs font-bold px-4"
                >
                  {loginMutation.isPending ? "Verifying…" : "Sign In"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="relative min-h-screen overflow-hidden bg-[#ede8f5]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(112,145,230,0.44),transparent_30%),radial-gradient(circle_at_92%_84%,rgba(61,82,160,0.22),transparent_38%),linear-gradient(135deg,#ede8f5_0%,#dce2f5_48%,#bfcceb_100%)]" />
        <DotField className="pointer-events-none absolute inset-0 opacity-45" />
        {isMobile && (
          <div className="relative z-10 flex h-14 items-center justify-between border-b border-[#adbBda]/70 bg-[#ede8f5]/95 px-2 text-slate-800 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="skyworlds-workspace relative z-10 flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}

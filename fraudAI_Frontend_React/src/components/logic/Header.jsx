import { useState, useEffect } from "react";
import { Search, Bell, CreditCard, Menu, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import SidebarContent from './SidebarContent';
import axios from "axios";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";

const Header = ({ user }) => {
  const [apiOnline, setApiOnline] = useState(null); // null=checking, true=online, false=offline

  useEffect(() => {
    const check = () => {
      axios.get(`${API}/`, { timeout: 3000 })
        .then(() => setApiOnline(true))
        .catch(() => setApiOnline(false));
    };
    check();
    const interval = setInterval(check, 30000); // re-check every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-10 backdrop-blur-xl bg-black/20 border-b border-white/10">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden mr-2">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-[#0f172a] border-r border-white/10">
              <SidebarContent />
            </SheetContent>
          </Sheet>
          <div className="flex items-center md:hidden">
            <CreditCard className="h-8 w-8 text-blue-400" />
            <span className="ml-2 text-xl font-bold text-blue-400">SafePayAI</span>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {/* API status indicator */}
          <div
            title={
              apiOnline === null
                ? "Checking AI server..."
                : apiOnline
                ? "AI server online"
                : "AI server offline — start Flask on port 5000"
            }
            className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
              apiOnline === null
                ? "border-gray-700 text-gray-500"
                : apiOnline
                ? "border-green-500/40 bg-green-500/10 text-green-400"
                : "border-red-500/40 bg-red-500/10 text-red-400"
            }`}
          >
            {apiOnline === false ? (
              <WifiOff className="h-3 w-3" />
            ) : (
              <Wifi className={`h-3 w-3 ${apiOnline === null ? "animate-pulse" : ""}`} />
            )}
            <span>
              {apiOnline === null ? "Checking..." : apiOnline ? "AI Online" : "AI Offline"}
            </span>
          </div>

          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/50" />
            <Input
              type="text"
              placeholder="Quick search..."
              className="pl-9 w-52 bg-white/5 border-white/10 text-white placeholder:text-white/50 focus:bg-white/10"
            />
          </div>
          <Button variant="ghost" size="icon" className="text-white/70 hover:text-white">
            <Bell className="h-5 w-5" />
          </Button>
          <Avatar>
            <AvatarImage src={user?.photoURL} alt="User" />
            <AvatarFallback className="bg-blue-600 text-white text-sm">
              {user?.displayName?.charAt(0) ?? "U"}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
};

export default Header;
